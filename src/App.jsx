import { useEffect, useRef, useState } from 'react';
import { ArrowCounterClockwise, ArrowsOutCardinal, DotsNine, GridNine, Info, Pause, Play, StackSimple, X } from '@phosphor-icons/react';
import { OpticalRenderer } from './optics/renderer.js';
import { DEFAULTS, MATERIALS, PATTERNS, frostingFor } from './materials.js';

function Toggle({ checked, onChange, label, disabled = false }) {
  return <button type="button" role="switch" aria-label={label} aria-checked={checked} disabled={disabled} className="toggle" onClick={() => onChange(!checked)}><span /></button>;
}

function Slider({ id, label, value, min, max, step = 1, unit, disabled, onChange, editable = false }) {
  const display = unit === '×' ? value.toFixed(1) : value;
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    const n = draft.trim() === '' ? value : Number(draft);
    const next = Math.max(min, Math.min(max, Number((Math.round(n / step) * step).toFixed(2))));
    onChange(Number.isFinite(next) ? next : value);
    setDraft(String(Number.isFinite(next) ? next : value));
  };
  return <div className={`slider-row ${disabled ? 'is-disabled' : ''}`}>
    <label htmlFor={id}>{label}</label>
    <input id={id} type="range" min={min} max={max} step={step} value={value} disabled={disabled} onChange={event => onChange(Number(event.target.value))} style={{ '--progress': `${(value - min) / (max - min) * 100}%` }} />
    {editable ? <span className="number-value"><input type="number" aria-label={`${label}数值`} min={min} max={max} step={step} value={draft} disabled={disabled} onChange={event => {
      setDraft(event.target.value);
      const n = Number(event.target.value);
      if (event.target.value !== '' && Number.isFinite(n) && n >= min && n <= max) onChange(n);
    }} onBlur={commit} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }} /><span>{unit}</span></span> : <output htmlFor={id}>{display}<span>{unit}</span></output>}
  </div>;
}

function Choice({ label, value, options, disabled, onChange }) {
  return <div className={`choice-row ${disabled ? 'is-disabled' : ''}`}><span>{label}</span><div className="segmented" role="group" aria-label={label}>{options.map(option => <button type="button" key={option.value} aria-pressed={value === option.value} disabled={disabled} onClick={() => onChange(option.value)}>{option.label}</button>)}</div></div>;
}

export function App() {
  const reducedMotion = useRef(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [materialId, setMaterialId] = useState('wave');
  const [frosting, setFrosting] = useState({ wave: true, cones: false, honeycomb: false });
  const [values, setValues] = useState({ ...DEFAULTS });
  const [pattern, setPattern] = useState(0);
  const [playing, setPlaying] = useState(!reducedMotion.current);
  const [drifting, setDrifting] = useState(!reducedMotion.current);
  const [compare, setCompare] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [fps, setFps] = useState(null);
  const [info, setInfo] = useState(false);
  const canvas = useRef(null);
  const renderer = useRef(null);
  const dialog = useRef(null);
  const material = MATERIALS.find(item => item.id === materialId);
  const frosted = frostingFor(materialId, frosting);
  const structured = material.index > 1;

  useEffect(() => {
    let instance;
    try {
      instance = new OpticalRenderer(canvas.current, {
        onReady: () => setReady(true),
        onFps: setFps,
        onDrag: setDragging,
        onError: setError,
        reducedMotion: reducedMotion.current,
      });
      renderer.current = instance;
    } catch (failure) {
      setError(failure.message);
    }
    return () => { instance?.dispose(); renderer.current = null; };
  }, []);

  useEffect(() => {
    renderer.current?.update({ material: material.index, frost: frosted, ...values, pattern, playing, drifting, compare });
  }, [material.index, frosted, values, pattern, playing, drifting, compare]);

  useEffect(() => {
    if (info) dialog.current?.showModal();
    else dialog.current?.close();
  }, [info]);

  const changeValue = (key, value) => setValues(current => ({ ...current, [key]: value }));
  const reset = () => {
    setValues({ ...DEFAULTS });
    renderer.current?.resetPosition();
  };

  return <main className="app-shell">
    <header className="masthead">
      <a className="brand" href="#" aria-label="光屿首页"><DotsNine weight="regular" aria-hidden="true" /><span>光屿</span></a>
      <span className="wordmark">LIGHT THROUGH MATTER</span>
      <div className="live-status"><span className={ready && !error ? 'status-light on' : 'status-light'} />{error ? '光场暂不可用' : ready ? '实时光场' : '正在唤醒光场'}<small>{fps && !error ? `${fps} FPS` : ''}</small></div>
    </header>

    <div className="studio-layout">
      <section className="light-studio" aria-label="点阵光学实验">
        <div className="intro"><h1>让光，多一种形状。</h1><p>移动一层纹理，发现点阵的新表情。</p></div>

        <div className={`viewport ${dragging ? 'is-dragging' : ''} ${materialId === 'none' ? 'is-bare' : ''}`}>
          <canvas ref={canvas} aria-label="16×16 方形点阵实时光场。拖动以移动遮罩，方向键微调，Home 键复位。" tabIndex={0} />
          <div className="viewport-toolbar">
            <span>16 × 16 <i /> WS2812</span>
            <div className="viewport-actions">
              <button type="button" aria-label={compare ? '关闭原始点阵对比' : '对比原始点阵'} title="原始 / 遮罩对比" aria-pressed={compare} onClick={() => setCompare(!compare)}><GridNine size={23} weight="light" /></button>
              <i />
              <button type="button" aria-label="复位遮罩位置与参数" title="复位遮罩" onClick={reset}><ArrowCounterClockwise size={23} weight="light" /></button>
            </div>
          </div>
          {compare && <div className="comparison-guides"><span>原始点阵</span><span>透过遮罩</span></div>}
          {!error && materialId !== 'none' && <div className={`drag-hint ${dragging ? 'active' : ''}`}><ArrowsOutCardinal size={19} /><span>{dragging ? '光，随你移动' : '拖动遮罩，感受光的流动'}</span></div>}
          {error && <div className="render-error"><StackSimple size={32} /><strong>光场还没有亮起来</strong><p>{error}</p><button type="button" onClick={() => window.location.reload()}>重新加载</button></div>}
        </div>

        <div className="pattern-bar" aria-label="灯光图案">
          <div className="pattern-options">{PATTERNS.map(item => <button type="button" key={item.id} className={pattern === item.id ? 'selected' : ''} aria-pressed={pattern === item.id} onClick={() => setPattern(item.id)}>{item.name}</button>)}</div>
          <button type="button" className="play-button" aria-label={playing ? '暂停灯光动画' : '播放灯光动画'} title={playing ? '暂停灯光，仍可移动遮罩' : '播放灯光动画'} onClick={() => setPlaying(!playing)}>{playing ? <Pause weight="fill" /> : <Play weight="fill" />}</button>
        </div>
      </section>

      <aside className="material-panel" aria-label="遮罩材质与参数">
        <h2>选择一层质感</h2>
        <div className="material-grid">{MATERIALS.map(item => <button type="button" key={item.id} aria-pressed={item.id === materialId} className={`material-choice ${item.id === materialId ? 'selected' : ''}`} onClick={() => setMaterialId(item.id)}><span className="swatch"><img src={item.image} alt="" draggable="false" /></span><span>{item.name}</span></button>)}</div>

        <section className="inspector" aria-label={`${material.name}设置`}>
          <div className="material-copy" key={materialId}><h3>{material.name}</h3><p>{material.description}</p></div>
          <div className="acrylic-controls">
            <Choice label="亚克力" value={values.acrylic} options={[{ value: 'clear', label: '透明' }, { value: 'opal', label: '乳白' }]} disabled={materialId === 'none'} onChange={value => changeValue('acrylic', value)} />
            <p className="acrylic-note">{values.acrylic === 'opal' ? '内部也会散射，关掉磨砂仍然柔和。' : '保留清透光路，磨砂由表面决定。'}</p>
          </div>
          <div className={`frost-control ${structured ? '' : 'fixed'}`}>
            <div><span>{structured ? '磨砂' : materialId === 'frost' ? '细腻，始终如一' : '原始光场'}</span><p>{structured ? '在纹理之上，添一层柔光' : material.note}</p></div>
            {structured && <Toggle label={`${material.name}磨砂`} checked={frosted} onChange={checked => setFrosting(current => ({ ...current, [materialId]: checked }))} />}
            {!structured && <span className="material-tag">{materialId === 'frost' ? '固定开启' : '无折射'}</span>}
          </div>
          <Choice label="磨砂面" value={values.sides} options={[{ value: 'single', label: '单面' }, { value: 'double', label: '双面' }]} disabled={!frosted} onChange={value => changeValue('sides', value)} />

          <div className="sliders">
            <Slider id="thickness" label="基底厚度" value={values.thickness} min={0.5} max={20} step={0.5} unit="mm" editable disabled={materialId === 'none'} onChange={value => changeValue('thickness', value)} />
            <Slider id="distance" label="离屏距离" value={values.distance} min={0} max={200} unit="mm" editable disabled={materialId === 'none'} onChange={value => changeValue('distance', value)} />
            <Slider id="scale" label="纹理尺度" value={values.scale} min={0.5} max={2.5} step={0.1} unit="×" disabled={!structured} onChange={value => changeValue('scale', value)} />
            <Slider id="roughness" label="磨砂强度" value={values.roughness} min={0} max={100} unit="%" disabled={!frosted} onChange={value => changeValue('roughness', value)} />
          </div>

          <div className="drift-control"><span>自动漂移</span><Toggle label="自动漂移" checked={drifting} disabled={materialId === 'none'} onChange={setDrifting} /></div>
        </section>
      </aside>
    </div>

    <footer><span /><p>一次光与材质的小实验</p><span /><button type="button" aria-label="了解光学模型" title="关于这个光学实验" onClick={() => setInfo(true)}><Info size={18} weight="light" /></button></footer>

    <dialog ref={dialog} className="about-dialog" onCancel={() => setInfo(false)} onClick={event => { if (event.target === dialog.current) setInfo(false); }}>
      <button type="button" className="close-dialog" aria-label="关闭光学说明" onClick={() => setInfo(false)}><X size={22} /></button>
      <span className="eyebrow">A LITTLE OPTICAL EXPERIMENT</span><h2>光，怎样穿过一层纹理？</h2>
      <p>透明与乳白是两种亚克力预设。厚度、表面处理和离屏距离分别参与光路与散射计算；它们可以自由组合。</p>
      <dl><div><dt>折射</dt><dd>亚克力折射率 1.49。按 Snell 定律计算纹理表面与底面的折射，并计入 Fresnel 透射率和吸收。</dd></div><div><dt>磨砂</dt><dd>连续积分方形发光面，不用少量离散重影模拟柔光。单面指朝向观察者的一面；双面叠加两个表面的散射方差。强度是参考粗糙度，并非实测雾度。</dd></div><div><dt>乳白</dt><dd>单独计算内部散射、直透分量和厚度造成的透光损耗。距离增大时，有限点阵的入射光能降低；关闭表面磨砂仍有内部混光。</dd></div><div><dt>尺寸</dt><dd>默认点阵节距 10 mm、方形发光面 9.2 mm，整个点阵宽 160 mm。离屏距离 0–200 mm，指灯面到亚克力底面的空气间隙；基底厚度 0.5–20 mm，纹理起伏另计。</dd></div></dl>
      <p className="model-note">散射角分布和乳白配方采用参考预设，尚未匹配某一块实物。使用归一化角分布与体散射近似，未完整求解粗糙介质的多次散射、内部反射与光谱。实际效果还取决于点阵尺寸、表面工艺和乳白材料的透光率。</p>
      <a href="https://pbr-book.org/4ed/Reflection_Models/Specular_Reflection_and_Transmission" target="_blank" rel="noreferrer">了解折射与透射的计算依据 ↗</a>
    </dialog>
  </main>;
}
