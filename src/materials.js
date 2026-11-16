export const MATERIALS = [
  { id: 'none', index: 0, name: '无遮罩', image: './assets/clear.webp', description: '让每一颗光，保持本来的模样。', note: '直接观察原始方形点阵。' },
  { id: 'frost', index: 1, name: '纯磨砂', image: './assets/frost.webp', description: '把清晰的像素，揉成温柔的光。', note: '均匀磨砂表面，散射始终开启。' },
  { id: 'cones', index: 2, name: '网格锥', image: './assets/cones.webp', description: '细小的棱面，把光折成新的秩序。', note: '方形锥面阵列，向不同方向折射。' },
  { id: 'wave', index: 3, name: '横向波纹', image: './assets/wave.webp', description: '让相邻光点，轻轻交叠。', note: '平行的起伏曲面，拉伸、重叠光的轮廓。' },
  { id: 'honeycomb', index: 4, name: '蜂窝透镜', image: './assets/honeycomb.webp', description: '让光在六边形里，悄悄聚拢。', note: '六角曲面透镜，汇聚与放大局部光场。' },
];

export const PATTERNS = [
  { id: 0, name: '极光' },
  { id: 1, name: '呼吸' },
  { id: 2, name: '涟漪' },
  { id: 3, name: '单点' },
];

export const DEFAULTS = Object.freeze({ distance: 8, thickness: 3, acrylic: 'clear', sides: 'single', scale: 1.2, roughness: 24 });

export function frostingFor(material, preferences) {
  return material === 'frost' || (material !== 'none' && Boolean(preferences[material]));
}
