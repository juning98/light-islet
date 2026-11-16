import { vertex, source, horizontal, field, scene, blur, composite } from './shaders.js';
import { WORLD_SIZE, FIELD_SIZE, opticalProfile, buildWeightTable } from './transport.js';
import { DEFAULTS } from '../materials.js';

const ease = (value) => value * value * (3 - 2 * value);
const approach = (from, to, rate, dt) => Math.abs(from - to) < .00001 ? to : from + (to - from) * (1 - Math.exp(-rate * dt));
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function program(gl, fragment) {
  const shaders = [[gl.VERTEX_SHADER, vertex], [gl.FRAGMENT_SHADER, fragment]].map(([type, source]) => {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const message = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(`光学着色器未能编译：${message}`);
    }
    return shader;
  });
  const result = gl.createProgram();
  for (const shader of shaders) gl.attachShader(result, shader);
  gl.linkProgram(result);
  for (const shader of shaders) gl.deleteShader(shader);
  if (!gl.getProgramParameter(result, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(result));
  const locations = {};
  for (let i = 0; i < gl.getProgramParameter(result, gl.ACTIVE_UNIFORMS); i++) {
    const uniform = gl.getActiveUniform(result, i);
    locations[uniform.name] = gl.getUniformLocation(result, uniform.name);
  }
  return { id: result, uniforms: locations };
}

function target(gl, size, height = size, floating = false) {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, floating ? gl.RGBA16F : gl.RGBA8, size, height, 0, gl.RGBA, floating ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const framebuffer = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('显卡无法创建光场缓冲区。');
  return { texture, framebuffer, size, height };
}

export class OpticalRenderer {
  constructor(canvas, callbacks) {
    this.canvas = canvas;
    this.callbacks = callbacks;
    this.gl = canvas.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
    if (!this.gl) throw new Error('当前浏览器未启用 WebGL 2，请在支持硬件加速的浏览器中打开。');
    const gl = this.gl;
    this.programs = Object.fromEntries(Object.entries({ source, horizontal, field, scene, blur, composite }).map(([key, fragment]) => [key, program(gl, fragment)]));
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    this.config = { ...DEFAULTS, material: 3, frost: true, pattern: 0, playing: !callbacks.reducedMotion, drifting: !callbacks.reducedMotion, compare: false };
    this.current = { gap: DEFAULTS.distance, thickness: DEFAULTS.thickness, scale: DEFAULTS.scale, roughness: DEFAULTS.roughness / 100, doubleSided: 0, opal: 0, presence: 1 };
    this.base = { x: 6.4, y: -6.4 };
    this.position = { ...this.base };
    this.motion = { x: 0, y: 0 };
    this.velocity = { x: 0, y: 0 };
    this.materialFrom = 3;
    this.materialProgress = 1;
    this.patternFrom = 0;
    this.patternProgress = 1;
    this.lightTime = 1.8;
    this.driftTime = 0;
    this.last = 0;
    this.frames = 0;
    this.fpsTime = 0;
    this.quality = 1;
    this.targets = [];
    const floating = Boolean(gl.getExtension('EXT_color_buffer_float'));
    this.floating = floating;
    this.lightTargets = {
      source: target(gl, 16, 16, floating),
      horizontal: target(gl, FIELD_SIZE, 128, floating),
      surface: target(gl, FIELD_SIZE, FIELD_SIZE, floating),
      bulk: target(gl, FIELD_SIZE, FIELD_SIZE, floating),
    };
    this.weightTextures = [0, 1].map(() => {
      const texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, FIELD_SIZE, 16, 0, gl.RGBA, gl.FLOAT, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return texture;
    });
    this.listeners = [];
    this.bindPointer();
    this.listen(canvas, 'webglcontextlost', (event) => {
      event.preventDefault();
      cancelAnimationFrame(this.frame);
      callbacks.onError('显卡上下文已中断，重新加载页面即可继续。');
    });
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(canvas);
    this.resize();
    this.frame = requestAnimationFrame(time => this.render(time));
  }

  listen(element, event, fn, options) {
    element.addEventListener(event, fn, options);
    this.listeners.push(() => element.removeEventListener(event, fn, options));
  }

  update(next) {
    if (next.material !== this.config.material) {
      if (next.material !== 0) {
        this.materialFrom = this.config.material;
        this.materialProgress = this.callbacks.reducedMotion ? 1 : 0;
      }
      // Retract then replace the sheet with a small, continuous shift.
      this.velocity.x += next.material === 0 ? 0 : 4;
    }
    if (next.pattern !== this.config.pattern) {
      this.patternFrom = this.config.pattern;
      this.patternProgress = this.callbacks.reducedMotion ? 1 : 0;
    }
    this.config = { ...this.config, ...next };
  }

  resetPosition() {
    this.base = { x: 6.4, y: -6.4 };
    this.velocity = { x: 0, y: 0 };
  }

  bindPointer() {
    const canvas = this.canvas;
    this.listen(canvas, 'pointerdown', (event) => {
      if (this.config.material === 0 || (event.button !== 0 && event.pointerType === 'mouse')) return;
      canvas.setPointerCapture(event.pointerId);
      canvas.focus({ preventScroll: true });
      this.drag = { pointer: event.pointerId, x: event.clientX, y: event.clientY, baseX: this.position.x, baseY: this.position.y, lastX: event.clientX, lastY: event.clientY, lastTime: performance.now() };
      this.base = { ...this.position };
      this.velocity = { x: 0, y: 0 };
      this.motion = { x: 0, y: 0 };
      this.callbacks.onDrag(true);
    });
    this.listen(canvas, 'pointermove', (event) => {
      if (!this.drag || event.pointerId !== this.drag.pointer) return;
      const ratio = WORLD_SIZE / canvas.getBoundingClientRect().width;
      const now = performance.now();
      const dt = Math.max((now - this.drag.lastTime) / 1000, .008);
      this.base.x = clamp(this.drag.baseX + (event.clientX - this.drag.x) * ratio, -110, 110);
      this.base.y = clamp(this.drag.baseY - (event.clientY - this.drag.y) * ratio, -110, 110);
      this.velocity.x = clamp((event.clientX - this.drag.lastX) * ratio / dt, -100, 100);
      this.velocity.y = clamp(-(event.clientY - this.drag.lastY) * ratio / dt, -100, 100);
      Object.assign(this.drag, { lastX: event.clientX, lastY: event.clientY, lastTime: now });
    });
    const release = (event) => {
      if (!this.drag || event.pointerId !== this.drag.pointer) return;
      if (performance.now() - this.drag.lastTime > 90 || this.callbacks.reducedMotion) this.velocity = { x: 0, y: 0 };
      this.drag = null;
      this.callbacks.onDrag(false);
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    };
    this.listen(canvas, 'pointerup', release);
    this.listen(canvas, 'pointercancel', release);
    this.listen(canvas, 'lostpointercapture', release);
    this.listen(canvas, 'keydown', (event) => {
      if (this.config.material === 0) return;
      const delta = event.shiftKey ? 5 : 1;
      const directions = { ArrowLeft: [-delta, 0], ArrowRight: [delta, 0], ArrowUp: [0, delta], ArrowDown: [0, -delta] };
      if (event.key === 'Home') { event.preventDefault(); this.resetPosition(); }
      if (directions[event.key]) {
        event.preventDefault();
        const [x,y] = directions[event.key];
        this.base.x = clamp(this.base.x + x, -110, 110);
        this.base.y = clamp(this.base.y + y, -110, 110);
      }
    });
  }

  resize() {
    const width = this.canvas.getBoundingClientRect().width;
    if (!width) return;
    const size = Math.max(280, Math.min(960, Math.round(width * Math.min(window.devicePixelRatio || 1, 1.5) * this.quality)));
    if (this.size === size) return;
    this.size = size;
    const gl = this.gl;
    for (const item of this.targets) { gl.deleteTexture(item.texture); gl.deleteFramebuffer(item.framebuffer); }
    this.canvas.width = size;
    this.canvas.height = size;
    this.targets = [target(gl, size, size, this.floating), target(gl, Math.ceil(size / 2), Math.ceil(size / 2), this.floating), target(gl, Math.ceil(size / 2), Math.ceil(size / 2), this.floating)];
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  draw(programInfo, destination) {
    const gl = this.gl;
    gl.useProgram(programInfo.id);
    gl.bindFramebuffer(gl.FRAMEBUFFER, destination?.framebuffer ?? null);
    const size = destination?.size ?? this.size;
    gl.viewport(0, 0, size, destination?.height ?? size);
  }

  texture(programInfo, name, texture, unit) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(programInfo.uniforms[name], unit);
  }

  patternUniforms(programInfo) {
    const gl = this.gl;
    const u = programInfo.uniforms;
    gl.uniform1f(u.uTime, this.lightTime);
    gl.uniform1i(u.uPattern, this.config.pattern);
    gl.uniform1i(u.uPreviousPattern, this.patternFrom);
    gl.uniform1f(u.uPatternMorph, ease(this.patternProgress));
  }

  updateLightFields() {
    const gl = this.gl;
    const c = this.current;
    const profileKey = [c.gap.toFixed(3), c.thickness.toFixed(3), c.roughness.toFixed(5), c.doubleSided.toFixed(4), c.opal > .0001].join(',');
    const weightsChanged = profileKey !== this.profileKey;
    if (weightsChanged) {
      this.profileKey = profileKey;
      this.profile = opticalProfile(c);
      const tables = buildWeightTable(this.profile);
      for (let i = 0; i < 2; i++) {
        gl.bindTexture(gl.TEXTURE_2D, this.weightTextures[i]);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, FIELD_SIZE, 16, gl.RGBA, gl.FLOAT, tables[i]);
      }
    }
    const lightKey = `${this.lightTime},${this.config.pattern},${this.patternFrom},${this.patternProgress}`;
    if (!weightsChanged && lightKey === this.lightKey) return;
    this.lightKey = lightKey;
    const p = this.programs;
    const targets = this.lightTargets;
    this.draw(p.source, targets.source);
    this.patternUniforms(p.source);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    this.draw(p.horizontal, targets.horizontal);
    this.texture(p.horizontal, 'uSource', targets.source.texture, 0);
    this.texture(p.horizontal, 'uWeights0', this.weightTextures[0], 1);
    this.texture(p.horizontal, 'uWeights1', this.weightTextures[1], 2);
    // A clear sheet only needs the surface lobe (the first 16 rows).
    if (c.opal <= .0001) gl.viewport(0, 0, FIELD_SIZE, 16);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    this.draw(p.field, targets.surface);
    this.texture(p.field, 'uHorizontal', targets.horizontal.texture, 0);
    this.texture(p.field, 'uWeights0', this.weightTextures[0], 1);
    this.texture(p.field, 'uWeights1', this.weightTextures[1], 2);
    gl.uniform1i(p.field.uniforms.uBulk, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (c.opal > .0001) {
      this.draw(p.field, targets.bulk);
      gl.uniform1i(p.field.uniforms.uBulk, 1);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
  }

  render(now) {
    if (this.disposed) return;
    this.frame = requestAnimationFrame(time => this.render(time));
    if (document.hidden) { this.last = now; return; }
    const elapsed = this.last ? (now - this.last) / 1000 : 1 / 60;
    const dt = Math.min(elapsed, .05);
    this.last = now;
    if (this.config.playing) this.lightTime += dt;
    if (this.config.drifting && !this.drag) this.driftTime += dt;
    const rate = this.callbacks.reducedMotion ? 1000 : 11;
    const desiredMotion = this.config.drifting && !this.drag ? { x: Math.sin(this.driftTime * .28) * 3.4, y: Math.sin(this.driftTime * .22 + .6) * 2.8 } : { x: 0, y: 0 };
    for (const axis of ['x','y']) {
      this.motion[axis] = approach(this.motion[axis], desiredMotion[axis], 2, dt);
      if (!this.drag) {
        this.base[axis] = clamp(this.base[axis] + this.velocity[axis] * dt, -110, 110);
        this.velocity[axis] *= Math.exp(-9 * dt);
      }
      this.position[axis] = approach(this.position[axis], this.base[axis] + this.motion[axis], this.drag ? 30 : rate, dt);
    }
    this.current.gap = approach(this.current.gap, this.config.distance, rate, dt);
    this.current.thickness = approach(this.current.thickness, this.config.thickness, rate, dt);
    this.current.doubleSided = approach(this.current.doubleSided, this.config.sides === 'double' ? 1 : 0, rate, dt);
    this.current.opal = approach(this.current.opal, this.config.acrylic === 'opal' ? 1 : 0, rate, dt);
    this.current.scale = approach(this.current.scale, this.config.scale, rate, dt);
    this.current.roughness = approach(this.current.roughness, this.config.frost ? this.config.roughness / 100 : 0, rate, dt);
    this.current.presence = approach(this.current.presence, this.config.material === 0 ? 0 : 1, rate, dt);
    this.materialProgress = Math.min(1, this.materialProgress + dt * 2.1);
    this.patternProgress = Math.min(1, this.patternProgress + dt * 2.4);

    const gl = this.gl;
    this.updateLightFields();
    const p = this.programs.scene;
    this.draw(p, this.targets[0]);
    const u = p.uniforms;
    gl.uniform2f(u.uResolution, this.size, this.size);
    this.patternUniforms(p);
    gl.uniform2f(u.uOffset, this.position.x, this.position.y);
    gl.uniform1f(u.uGap, this.current.gap);
    gl.uniform1f(u.uThickness, this.current.thickness);
    gl.uniform1f(u.uScale, this.current.scale);
    gl.uniform1f(u.uHaze, this.profile.haze);
    gl.uniform1f(u.uOpal, this.current.opal);
    gl.uniform1f(u.uBallistic, this.profile.ballistic);
    gl.uniform1f(u.uBulkTransmission, this.profile.bulkTransmission);
    gl.uniform1f(u.uFieldExtent, this.profile.extent);
    this.texture(p, 'uSurfaceField', this.lightTargets.surface.texture, 0);
    this.texture(p, 'uBulkField', this.lightTargets.bulk.texture, 1);
    gl.uniform1f(u.uPresence, this.current.presence);
    gl.uniform1i(u.uMaterial, this.config.material);
    gl.uniform1i(u.uPreviousMaterial, this.materialFrom);
    gl.uniform1f(u.uMorph, ease(this.materialProgress));
    gl.uniform1i(u.uCompare, this.config.compare ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    const blurProgram = this.programs.blur;
    this.draw(blurProgram, this.targets[1]);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.targets[0].texture);
    gl.uniform1i(blurProgram.uniforms.uImage, 0);
    gl.uniform2f(blurProgram.uniforms.uDirection, 3 / this.size, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    this.draw(blurProgram, this.targets[2]);
    gl.bindTexture(gl.TEXTURE_2D, this.targets[1].texture);
    gl.uniform2f(blurProgram.uniforms.uDirection, 0, 3 / this.size);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    const final = this.programs.composite;
    this.draw(final, null);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.targets[0].texture);
    gl.uniform1i(final.uniforms.uScene, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.targets[2].texture);
    gl.uniform1i(final.uniforms.uGlow, 1);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    if (!this.ready) {
      const error = gl.getError();
      if (error !== gl.NO_ERROR) {
        this.callbacks.onError(`光场绘制失败（WebGL ${error}）。`);
        cancelAnimationFrame(this.frame);
        return;
      }
      this.ready = true;
      this.callbacks.onReady();
    }
    if (elapsed > .25) {
      // A suspended tab or a long dev-tool pause is not a GPU frame sample.
      this.frames = 0;
      this.fpsTime = 0;
      this.callbacks.onFps(null);
    } else {
      this.frames++;
      this.fpsTime += elapsed;
    }
    if (this.fpsTime >= 1.25) {
      const fps = Math.round(this.frames / this.fpsTime);
      this.callbacks.onFps(fps);
      // Reduce display resolution while keeping the emitter integration intact.
      if (fps < 37 && this.quality > .7 && now > 5000) { this.quality -= .1; this.resize(); }
      this.fpsTime = 0;
      this.frames = 0;
    }
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.observer.disconnect();
    for (const cleanup of this.listeners) cleanup();
    const gl = this.gl;
    for (const item of [...this.targets, ...Object.values(this.lightTargets)]) { gl.deleteTexture(item.texture); gl.deleteFramebuffer(item.framebuffer); }
    for (const texture of this.weightTextures) gl.deleteTexture(texture);
    for (const item of Object.values(this.programs)) gl.deleteProgram(item.id);
    gl.deleteVertexArray(this.vao);
  }
}
