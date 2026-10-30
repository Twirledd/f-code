import React from 'react'

/**
 * A clean-room glyph set standing in for SF Symbols in the Simulator canvas.
 * Names follow SF Symbols so app code is unchanged. Decorators (.fill, .circle,
 * .square, .slash) are composed from base glyphs.
 */

// 24x24 stroke-based path data. `fill: true` glyphs are drawn filled.
const GLYPHS: Record<string, { d: string; fill?: boolean }> = {
  globe: { d: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM2 12h20M12 2c3 3.5 3 16.5 0 20M12 2c-3 3.5-3 16.5 0 20' },
  gearshape: { d: 'M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z' },
  gear: { d: 'M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zM12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1' },
  checkmark: { d: 'm5 12.5 4.5 4.5L19 7' },
  xmark: { d: 'M6 6l12 12M18 6 6 18' },
  plus: { d: 'M12 5v14M5 12h14' },
  minus: { d: 'M5 12h14' },
  multiply: { d: 'M6 6l12 12M18 6 6 18' },
  divide: { d: 'M5 12h14M12 6.5h.01M12 17.5h.01' },
  equal: { d: 'M5 9h14M5 15h14' },
  'chevron.left': { d: 'm15 5-7 7 7 7' },
  'chevron.right': { d: 'm9 5 7 7-7 7' },
  'chevron.up': { d: 'm5 15 7-7 7 7' },
  'chevron.down': { d: 'm5 9 7 7 7-7' },
  'arrow.left': { d: 'M20 12H4M10 6l-6 6 6 6' },
  'arrow.right': { d: 'M4 12h16M14 6l6 6-6 6' },
  'arrow.up': { d: 'M12 20V4M6 10l6-6 6 6' },
  'arrow.down': { d: 'M12 4v16M6 14l6 6 6-6' },
  'arrow.clockwise': { d: 'M20 12a8 8 0 1 1-2.3-5.7L20 8M20 3v5h-5' },
  'arrow.counterclockwise': { d: 'M4 12a8 8 0 1 0 2.3-5.7L4 8M4 3v5h5' },
  'arrow.triangle.2.circlepath': { d: 'M17 2l3 3-3 3M20 5H9a5 5 0 0 0-5 5M7 22l-3-3 3-3M4 19h11a5 5 0 0 0 5-5' },
  'arrow.uturn.left': { d: 'M9 14 4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3' },
  'arrow.up.arrow.down': { d: 'M8 20V4M4 8l4-4 4 4M16 4v16M12 16l4 4 4-4' },
  'arrowshape.turn.up.left': { d: 'M10 5 3 11l7 6v-4c6 0 9 2 11 6 0-7-4-10-11-10z', fill: true },
  'square.and.arrow.up': { d: 'M12 15V3M8 7l4-4 4 4M5 11v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8' },
  'square.and.arrow.down': { d: 'M12 3v12M8 11l4 4 4-4M5 11v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8' },
  magnifyingglass: { d: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4' },
  house: { d: 'M3 11 12 3l9 8M5 10v10h5v-6h4v6h5V10' },
  person: { d: 'M12 3.5a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM4 20.5c1-4 4-6 8-6s7 2 8 6z' },
  'person.2': { d: 'M9 4.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zM2 20c1-4 3.5-6 7-6s6 2 7 6zM16 5a3 3 0 0 1 0 6M22 20c-.5-3.5-2-5.5-5-6' },
  star: { d: 'm12 3 2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.4l-5.7 3.1 1.2-6.4L2.8 9.7l6.4-.8z' },
  heart: { d: 'M12 20.5s-8-5.2-8-11A4.5 4.5 0 0 1 12 7a4.5 4.5 0 0 1 8 2.5c0 5.8-8 11-8 11z' },
  bell: { d: 'M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0' },
  trash: { d: 'M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6M14 11v6' },
  pencil: { d: 'm4 20 1-4L17 4l3 3L8 19zM14 7l3 3' },
  'square.and.pencil': { d: 'M11 5H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-5M18 3l3 3-9 9H9v-3z' },
  doc: { d: 'M6 3h8l5 5v13H6zM14 3v5h5' },
  'doc.text': { d: 'M6 3h8l5 5v13H6zM14 3v5h5M9 12h6M9 16h6' },
  'doc.on.doc': { d: 'M8 7h9l3 3v10H8zM8 7V3H3v13h5' },
  folder: { d: 'M3 6h6l2 2h10v11H3z' },
  'list.bullet': { d: 'M8 6h13M8 12h13M8 18h13M4 6h.01M4 12h.01M4 18h.01' },
  'list.dash': { d: 'M8 6h13M8 12h13M8 18h13M3 6h2M3 12h2M3 18h2' },
  checklist: { d: 'M10 6h11M10 12h11M10 18h11M3 6l1.5 1.5L7 5M3 12l1.5 1.5L7 11M3 18l1.5 1.5L7 17' },
  number: { d: 'M9 4 7 20M17 4l-2 16M4 9h17M3 15h17' },
  numbersign: { d: 'M9 4 7 20M17 4l-2 16M4 9h17M3 15h17' },
  calendar: { d: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4' },
  clock: { d: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2' },
  timer: { d: 'M12 6a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM12 10v4M9 2h6' },
  stopwatch: { d: 'M12 6a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM12 10v4M10 2h4M18 6l2-2' },
  alarm: { d: 'M12 6a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM12 10v4h3M3 6l3-3M21 6l-3-3' },
  hourglass: { d: 'M6 3h12M6 21h12M8 3c0 5 4 5 4 9s-4 4-4 9M16 3c0 5-4 5-4 9s4 4 4 9' },
  map: { d: 'M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2zM9 4v14M15 6v14' },
  mappin: { d: 'M12 21s-6-6-6-11a6 6 0 0 1 12 0c0 5-6 11-6 11zM12 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4z' },
  location: { d: 'm3 11 18-8-8 18-2-8z' },
  camera: { d: 'M3 8h4l2-3h6l2 3h4v12H3zM12 10a4 4 0 1 0 0 8 4 4 0 0 0 0-8z' },
  photo: { d: 'M3 5h18v14H3zM3 16l5-5 4 4 3-3 6 6M16 9h.01' },
  envelope: { d: 'M3 6h18v12H3zM3 7l9 6 9-6' },
  mail: { d: 'M3 6h18v12H3zM3 7l9 6 9-6' },
  phone: { d: 'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z' },
  message: { d: 'M4 5h16v11H9l-5 4z' },
  'bubble.left': { d: 'M4 5h16v11H9l-5 4z' },
  'bubble.right': { d: 'M4 5h16v11h-5l-5 4v-4H4z' },
  'text.bubble': { d: 'M4 5h16v11H9l-5 4zM8 9h8M8 12h5' },
  paperplane: { d: 'm3 11 18-8-5 18-4-7z M12 14l9-11' },
  lock: { d: 'M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4' },
  'lock.open': { d: 'M6 11h12v10H6zM8 11V7a4 4 0 0 1 7.5-2' },
  key: { d: 'M14 4a5 5 0 1 0 1.5 9.8L21 19v2h-3v-2h-2v-2h-2l-1-1.3A5 5 0 0 0 14 4zM13 8h.01' },
  bookmark: { d: 'M6 3h12v18l-6-4-6 4z' },
  tag: { d: 'M3 12V3h9l9 9-9 9zM7 7h.01' },
  cart: { d: 'M3 4h3l2.5 11h10l2-7H7.5M10 20a1 1 0 1 0 0 .01M17 20a1 1 0 1 0 0 .01' },
  creditcard: { d: 'M3 6h18v12H3zM3 10h18M7 15h3' },
  bag: { d: 'M5 8h14l-1 13H6zM9 8V6a3 3 0 0 1 6 0v2' },
  gift: { d: 'M3 9h18v4H3zM5 13v8h14v-8M12 9v12M12 9c-2-4-6-4-6-1s4 1 6 1zM12 9c2-4 6-4 6-1s-4 1-6 1z' },
  bolt: { d: 'M13 2 4 14h7l-1 8 9-12h-7z', fill: true },
  flame: { d: 'M12 22c-4 0-7-3-7-7 0-3 2-5 3-7 0 2 1 3 2 3 0-4 2-7 5-9 0 4 4 6 4 11 0 5-3 9-7 9z' },
  'sun.max': { d: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4' },
  moon: { d: 'M20 14A8 8 0 0 1 10 4a8 8 0 1 0 10 10z' },
  cloud: { d: 'M7 18a4 4 0 0 1-.5-8A6 6 0 0 1 18 9a4.5 4.5 0 0 1-1 9z' },
  drop: { d: 'M12 3s6 7 6 12a6 6 0 0 1-12 0c0-5 6-12 6-12z' },
  leaf: { d: 'M4 20C4 10 10 4 21 4c0 11-6 17-16 17M4 20c3-5 7-9 12-12' },
  snowflake: { d: 'M12 2v20M2 12h20M5 5l14 14M19 5 5 19' },
  wind: { d: 'M3 8h11a3 3 0 1 0-3-3M3 12h15a3 3 0 1 1-3 3M3 16h8a2 2 0 1 1-2 2' },
  info: { d: 'M12 8h.01M12 11v6' },
  exclamationmark: { d: 'M12 5v9M12 18h.01' },
  'exclamationmark.triangle': { d: 'M12 3 2 20h20zM12 10v4M12 17h.01' },
  questionmark: { d: 'M9.5 9a2.5 2.5 0 1 1 4 2c-1 .7-1.5 1.2-1.5 2.5M12 18h.01' },
  lightbulb: { d: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.6.6 1 1.3 1 2.5h6c0-1.2.4-1.9 1-2.5A6 6 0 0 0 12 3z' },
  eye: { d: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z' },
  ellipsis: { d: 'M5 12h.01M12 12h.01M19 12h.01' },
  'line.3.horizontal': { d: 'M4 6h16M4 12h16M4 18h16' },
  'line.horizontal.3.decrease': { d: 'M4 6h16M7 12h10M10 18h4' },
  'square.grid.2x2': { d: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z' },
  'circle.grid.3x3': { d: 'M5 5h.01M12 5h.01M19 5h.01M5 12h.01M12 12h.01M19 12h.01M5 19h.01M12 19h.01M19 19h.01' },
  'rectangle.stack': { d: 'M4 8h16v12H4zM6 5h12M8 2h8' },
  'square.stack': { d: 'M4 8h16v12H4zM6 5h12M8 2h8' },
  play: { d: 'M7 4v16l13-8z', fill: true },
  pause: { d: 'M7 4h3v16H7zM14 4h3v16h-3z', fill: true },
  stop: { d: 'M5 5h14v14H5z', fill: true },
  'backward.fill': { d: 'M11 5v14L2 12zM22 5v14l-9-7z', fill: true },
  'forward.fill': { d: 'M2 5v14l9-7zM13 5v14l9-7z', fill: true },
  'speaker.wave.2': { d: 'M3 9h4l5-4v14l-5-4H3zM15 9a4 4 0 0 1 0 6M18 6a8 8 0 0 1 0 12' },
  mic: { d: 'M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3zM6 11a6 6 0 0 0 12 0M12 17v4M8 21h8' },
  wifi: { d: 'M2 9a15 15 0 0 1 20 0M5.5 12.5a10 10 0 0 1 13 0M9 16a5 5 0 0 1 6 0M12 19.5h.01' },
  'battery.100': { d: 'M3 8h15v8H3zM20 10v4M5 10h11v4H5z' },
  'slider.horizontal.3': { d: 'M4 7h16M4 12h16M4 17h16M9 5v4M15 10v4M7 15v4' },
  link: { d: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1' },
  paperclip: { d: 'm21 11-8.5 8.5a5 5 0 0 1-7-7l8.5-8.5a3.3 3.3 0 0 1 4.7 4.7L10 17.4a1.7 1.7 0 0 1-2.3-2.3L15.5 7' },
  'music.note': { d: 'M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM9 18V4l11-2v12M20 14a3 3 0 1 1-6 0 3 3 0 0 1 6 0z' },
  gamecontroller: { d: 'M6 8h12a4 4 0 0 1 4 4l-1 5a2 2 0 0 1-3.5 1L15 15H9l-2.5 3A2 2 0 0 1 3 17l-1-5a4 4 0 0 1 4-4zM7 11v2M6 12h2M16 11h.01M18 13h.01' },
  'cup.and.saucer': { d: 'M4 6h12v6a5 5 0 0 1-5 5h-2a5 5 0 0 1-5-5zM16 8h2a2 2 0 0 1 0 4h-2M3 20h16' },
  'fork.knife': { d: 'M7 3v18M5 3v5a2 2 0 0 0 4 0V3M17 3c-2 2-2 8-2 8h4V3z' },
  car: { d: 'M5 11l2-5h10l2 5M3 11h18v6H3zM6 17v2M18 17v2M7 14h.01M17 14h.01' },
  airplane: { d: 'M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z', fill: true },
  bicycle: { d: 'M5 17a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 17a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM5 14l4-7h6l4 7M9 7l3 7h7M12 14h-7' },
  'figure.walk': { d: 'M13 3a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zM12 7l-3 6 2 2v6M12 7l3 3 3-1M9 13l-3 1-2 4M14 15l3 6' },
  'chart.bar': { d: 'M4 20V10M10 20V4M16 20v-7M22 20H2' },
  'chart.pie': { d: 'M12 12V3a9 9 0 1 1-8.5 12z M12 3a9 9 0 0 1 9 9h-9z' },
  'chart.line.uptrend.xyaxis': { d: 'M3 3v18h18M6 15l4-5 4 3 6-7' },
  dollarsign: { d: 'M12 3v18M16 7.5A3 3 0 0 0 13 5h-2a3 3 0 0 0 0 6h2a3 3 0 0 1 0 6h-2.5a3 3 0 0 1-2.5-2' },
  percent: { d: 'M19 5 5 19M7 5a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM17 15a2 2 0 1 0 0 4 2 2 0 0 0 0-4z' },
  textformat: { d: 'M4 20 10 4h1l6 16M6.5 14h8M20 8v12' },
  keyboard: { d: 'M3 6h18v12H3zM7 10h.01M11 10h.01M15 10h.01M7 14h10' },
  'hand.thumbsup': { d: 'M7 11v9H3v-9zM7 11l4-8a2 2 0 0 1 2 2v4h6a2 2 0 0 1 2 2l-2 7a2 2 0 0 1-2 2H7' },
  'hand.thumbsdown': { d: 'M7 13V4H3v9zM7 13l4 8a2 2 0 0 0 2-2v-4h6a2 2 0 0 0 2-2l-2-7a2 2 0 0 0-2-2H7' },
  flag: { d: 'M5 21V4M5 4h12l-2 4 2 4H5' },
  pin: { d: 'M12 17v5M8 7V4h8v3l2 6H6z' },
  shield: { d: 'M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z' },
  antenna: { d: 'M12 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM12 12v9M7 7a7 7 0 0 0 0 7M17 7a7 7 0 0 1 0 7M4 4a11 11 0 0 0 0 13M20 4a11 11 0 0 1 0 13' },
  iphone: { d: 'M7 2h10a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1zM10 19h4' },
  laptopcomputer: { d: 'M4 5h16v11H4zM2 19h20' },
  desktopcomputer: { d: 'M3 4h18v12H3zM9 20h6M12 16v4' },
  printer: { d: 'M7 8V3h10v5M4 8h16v8h-3v4H7v-4H4zM7 12h.01' },
  tv: { d: 'M3 5h18v12H3zM8 21h8' },
  headphones: { d: 'M4 14v-2a8 8 0 0 1 16 0v2M4 14h3v6H4zM17 14h3v6h-3z' },
  book: { d: 'M4 4h6a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2H4zM20 4h-6a2 2 0 0 0-2 2v14a2 2 0 0 1 2-2h6z' },
  graduationcap: { d: 'M2 9l10-4 10 4-10 4zM6 11v5c0 2 3 3 6 3s6-1 6-3v-5M22 9v5' },
  briefcase: { d: 'M3 8h18v12H3zM9 8V5h6v3M3 13h18' },
  'building.2': { d: 'M3 21V5h8v16M11 9h10v12M6 8h2M6 12h2M6 16h2M15 12h2M15 16h2M8 21v-4h2v4' },
  'cross.case': { d: 'M3 8h18v12H3zM9 8V5h6v3M12 11v6M9 14h6' },
  pills: { d: 'M4 9a4 4 0 0 1 8 0v6a4 4 0 0 1-8 0zM4 12h8M16 13a3.5 3.5 0 1 0 5 5' },
  waveform: { d: 'M3 12h2M7 8v8M11 4v16M15 7v10M19 10v4M22 12h-1' },
  tray: { d: 'M3 13h5l1 2h6l1-2h5v7H3zM3 13l3-8h12l3 8' },
  archivebox: { d: 'M3 5h18v4H3zM5 9v11h14V9M10 13h4' },
  clipboard: { d: 'M8 4H6a1 1 0 0 0-1 1v15a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1h-2M9 2h6v4H9z' },
  'note.text': { d: 'M4 4h16v16H4zM8 9h8M8 13h8M8 17h4' },
  'face.smiling': { d: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM9 10h.01M15 10h.01M8.5 14.5a5 5 0 0 0 7 0' },
  sparkles: { d: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 17l.7 2.3L22 20l-2.3.7L19 23l-.7-2.3L16 20l2.3-.7zM5 3l.5 1.5L7 5l-1.5.5L5 7l-.5-1.5L3 5l1.5-.5z', fill: true },
  'wand.and.stars': { d: 'M3 21 15 9M15 5l.7 2.3L18 8l-2.3.7L15 11l-.7-2.3L12 8l2.3-.7zM19 14l.5 1.5L21 16l-1.5.5L19 18l-.5-1.5L17 16l1.5-.5z' },
  paintbrush: { d: 'M18 3l3 3-9 9-3-3zM9 12a3 3 0 0 0-4 3c0 2-1 3-2 3 3 2 7 1 8-2a3 3 0 0 0 1-1' },
  scissors: { d: 'M6 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM20 4 8.1 15.9M14.5 14.5 20 20M8.1 8.1 12 12' },
  hammer: { d: 'm15 12-8.5 8.5a2.1 2.1 0 0 1-3-3L12 9M17.6 15 22 10.6M20.9 11.7l-1.3-1.3a3 3 0 0 1-.9-2.2v-.9L16 4.6A5.6 5.6 0 0 0 12.1 3H9l.9.8A6.2 6.2 0 0 1 12 8.4V10l2 2h2.5l2.3 1.9' },
  wrench: { d: 'M14.7 6.3a4.5 4.5 0 0 0 5.4 5.4l-9 9a2 2 0 0 1-2.8-2.8l9-9a4.5 4.5 0 0 0-5.3-5.3L15 6.6z' },
  cube: { d: 'M12 2 3 7v10l9 5 9-5V7zM3 7l9 5 9-5M12 12v10' },
  shippingbox: { d: 'M12 2 3 7v10l9 5 9-5V7zM3 7l9 5 9-5M12 12v10M7.5 4.5l9 5' },
  qrcode: { d: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h3v3h-3zM19 14h2v2h-2zM14 19h2v2h-2zM18 18h3v3h-3z' },
  barcode: { d: 'M3 5v14M7 5v14M10 5v14M13 5v14M17 5v14M21 5v14' },
  thermometer: { d: 'M12 14V5a2 2 0 0 0-4 0v9a4 4 0 1 0 4 0zM10 10v6' },
  umbrella: { d: 'M2 12a10 10 0 0 1 20 0zM12 12v7a2 2 0 0 1-4 0' },
  tortoise: { d: 'M3 15h18M6 15a6 6 0 0 1 12 0M18 13h3v2M6 15l-1 3M18 15l1 3' },
  hare: { d: 'M8 10c-2-6 0-8 2-8s1 5 1 8M14 10c2-6 0-8-2-8s-1 5-1 8M6 17a6 6 0 0 1 12 0v3H6z' },
  pawprint: { d: 'M12 20c-3 0-5-2-5-4s2-4 5-4 5 2 5 4-2 4-5 4zM7 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM17 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM10 7a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM14 7a2 2 0 1 0 0-4 2 2 0 0 0 0 4z', fill: true },
  bird: { d: 'M16 7a3 3 0 0 0-6 0v3L3 14l7 1 2 6h2l-1-6 7-4-4-1z' },
  fish: { d: 'M2 12s4-6 10-6 8 4 8 4l2-3v10l-2-3s-2 4-8 4-10-6-10-6zM15 11h.01' },
  tree: { d: 'M12 2 6 10h3l-4 6h5v6h4v-6h5l-4-6h3z' },
  'mountain.2': { d: 'm3 20 6-10 4 6 2-3 6 7zM8 10l1-2 2 3' },
  square: { d: 'M4 4h16v16H4z' },
  rectangle: { d: 'M3 6h18v12H3z' },
  triangle: { d: 'M12 4 3 20h18z' },
  capsule: { d: 'M8 6h8a6 6 0 0 1 0 12H8a6 6 0 0 1 0-12z' },
  seal: { d: 'M12 2l2.4 2 3-.5 1 2.9 2.7 1.4-.5 3L22 13l-1.9 2.4.5 3-3 .4-1.9 2.4L13 20l-2.4 1.2L8.3 19l-3-.4.5-3L4 13l2.4-2.2-.5-3 2.7-1.4 1-2.9 3 .5z' },
  app: { d: 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z' },
  circle: { d: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z' },
  'text.alignleft': { d: 'M4 6h16M4 10h10M4 14h16M4 18h10' },
  bold: { d: 'M7 4h6a3.5 3.5 0 0 1 0 7H7zM7 11h7a3.5 3.5 0 0 1 0 7H7z' },
  italic: { d: 'M10 4h8M6 20h8M14 4l-4 16' },
  underline: { d: 'M6 4v6a6 6 0 0 0 12 0V4M4 20h16' },
  at: { d: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM16 12v1.5a2.5 2.5 0 0 0 5 0V12a9 9 0 1 0-3.5 7.1' },
  'ellipsis.message': { d: 'M4 5h16v11H9l-5 4zM8 10.5h.01M12 10.5h.01M16 10.5h.01' },
  'xmark.bin': { d: 'M3 7h18l-2 13H5zM9 11l6 5M15 11l-6 5' },
  'arrow.up.right': { d: 'M7 17 17 7M8 7h9v9' },
  'arrow.down.right.and.arrow.up.left': { d: 'M20 4l-6 6M20 4h-5M20 4v5M4 20l6-6M4 20h5M4 20v-5' },
  'arrow.up.left.and.arrow.down.right': { d: 'M4 4l6 6M4 4h5M4 4v5M20 20l-6-6M20 20h-5M20 20v-5' },
  'plus.magnifyingglass': { d: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4M11 8v6M8 11h6' },
  'minus.magnifyingglass': { d: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4M8 11h6' },
  'chevron.left.forwardslash.chevron.right': { d: 'm8 7-5 5 5 5M16 7l5 5-5 5M14 4l-4 16' },
  terminal: { d: 'm4 17 6-5-6-5M12 19h8' },
  'swift': { d: 'M18.6 17.1c2.4-3.3 1.7-7.9-1.2-10.8.8 1.6 1 3.4.5 4.9C14.7 9.6 11.6 7.3 8.2 4.5c1.6 2.2 3.8 4.2 5.8 5.8-2.4-1-5-2.6-7.6-4.9 1.1 1.9 2.8 4.1 5 5.9-1.6-.7-3.1-1.6-4.7-2.8 2.4 3.3 5.5 5.7 9 6.6-1.7 1.2-3.8 1.3-6 .2-1.2-.7-2.5-.7-3.6-.2 1.4 1.3 3.2 2.5 5.4 2.8 3.4.6 5.9-.6 7.1-2.3.6-.8 2.1-.1 2.6 1.4.3-1.1 0-2.1-.5-3.1z', fill: true },
  'applelogo': { d: 'M16 3c-1.3.1-2.8.9-3.7 2-.8.9-1.4 2.3-1.2 3.6 1.4.1 2.9-.7 3.8-1.8.8-1 1.4-2.4 1.1-3.8zM19.5 16.5c-.5 1.2-.8 1.7-1.5 2.8-1 1.5-2.4 3.4-4.1 3.4-1.5 0-1.9-1-4-1-2 0-2.5 1-4 1-1.7 0-3-1.7-4-3.2C-.6 15.6-1 10.4 1.2 7.6c1.5-2 3.9-3.2 6.1-3.2 2.3 0 3.7 1.3 5.6 1.3 1.8 0 2.9-1.3 5.6-1.3 2 0 4.1 1.1 5.6 3-4.9 2.7-4.1 9.7-4.6 9.1z', fill: true }
}

const ALIASES: Record<string, string> = {
  'house.fill': 'house', 'person.crop.circle': 'person.circle', 'gearshape.2': 'gearshape', 'line.3.horizontal.decrease': 'line.horizontal.3.decrease',
  'magnifyingglass.circle': 'magnifyingglass.circle', 'cart.fill': 'cart', 'bag.fill': 'bag', 'trash.fill': 'trash', 'doc.fill': 'doc', 'folder.fill': 'folder',
  'bell.fill': 'bell', 'bookmark.fill': 'bookmark', 'tag.fill': 'tag', 'flag.fill': 'flag', 'shield.fill': 'shield', 'lock.fill': 'lock', 'star.fill': 'star',
  'heart.fill': 'heart', 'cloud.fill': 'cloud', 'moon.fill': 'moon', 'sun.max.fill': 'sun.max', 'leaf.fill': 'leaf', 'drop.fill': 'drop', 'bolt.fill': 'bolt',
  'flame.fill': 'flame', 'map.fill': 'map', 'mappin.and.ellipse': 'mappin', 'location.fill': 'location', 'camera.fill': 'camera', 'photo.fill': 'photo',
  'envelope.fill': 'envelope', 'phone.fill': 'phone', 'message.fill': 'message', 'paperplane.fill': 'paperplane', 'book.fill': 'book', 'pin.fill': 'pin',
  'mic.fill': 'mic', 'play.fill': 'play', 'pause.fill': 'pause', 'stop.fill': 'stop', 'lightbulb.fill': 'lightbulb', 'eye.fill': 'eye', 'calendar.badge.plus': 'calendar',
  'person.fill': 'person', 'person.2.fill': 'person.2', 'rectangle.stack.fill': 'rectangle.stack', 'square.stack.fill': 'square.stack', 'cube.fill': 'cube',
  'shippingbox.fill': 'shippingbox', 'gift.fill': 'gift', 'creditcard.fill': 'creditcard', 'briefcase.fill': 'briefcase', 'tray.fill': 'tray', 'archivebox.fill': 'archivebox',
  'paintbrush.fill': 'paintbrush', 'hammer.fill': 'hammer', 'wrench.fill': 'wrench', 'car.fill': 'car', 'airplane.departure': 'airplane', 'tv.fill': 'tv',
  'speaker.wave.2.fill': 'speaker.wave.2', 'hand.thumbsup.fill': 'hand.thumbsup', 'hand.thumbsdown.fill': 'hand.thumbsdown', 'face.smiling.inverse': 'face.smiling',
  'list.bullet.rectangle': 'list.bullet', 'text.justify': 'text.alignleft', 'info.circle.fill': 'info.circle', 'checkmark.seal': 'seal', 'checkmark.seal.fill': 'seal',
  'ellipsis.circle.fill': 'ellipsis.circle', 'arrow.right.circle.fill': 'arrow.right.circle', 'exclamationmark.triangle.fill': 'exclamationmark.triangle',
  'square.and.arrow.up.fill': 'square.and.arrow.up', 'plus.app': 'plus.square', 'minus.app': 'minus.square', 'wifi.slash': 'wifi.slash', 'gear.badge': 'gear',
  'antenna.radiowaves.left.and.right': 'antenna', 'iphone.gen3': 'iphone', 'desktopcomputer.and.arrow.down': 'desktopcomputer', 'doc.text.fill': 'doc.text',
  'rectangle.fill': 'rectangle', 'square.fill': 'square', 'triangle.fill': 'triangle', 'capsule.fill': 'capsule', 'app.fill': 'app', 'seal.fill': 'seal', 'circle.fill': 'circle',
  'number.circle': 'number.circle', 'textformat.size': 'textformat', 'chevron.forward': 'chevron.right', 'chevron.backward': 'chevron.left', 'arrow.forward': 'arrow.right',
  'arrow.backward': 'arrow.left', 'arrow.up.right.square': 'arrow.up.right.square', 'link.circle': 'link.circle', 'clock.fill': 'clock', 'timer.circle': 'timer'
}

interface Resolved {
  base: string
  fill: boolean
  wrap?: 'circle' | 'square'
  slash: boolean
}

function resolve(name: string): Resolved {
  let n = ALIASES[name] ?? name
  let fill = false
  let wrap: Resolved['wrap']
  let slash = false
  const strip = (suffix: string): boolean => {
    if (n.endsWith(suffix)) {
      n = n.slice(0, -suffix.length)
      return true
    }
    return false
  }
  // Decorators appear in the order base[.circle|.square][.fill|.slash]
  for (let i = 0; i < 3; i++) {
    if (strip('.fill')) fill = true
    else if (strip('.slash')) slash = true
    else if (strip('.circle')) wrap = 'circle'
    else if (strip('.square')) wrap = 'square'
  }
  n = ALIASES[n] ?? n
  if (!GLYPHS[n]) {
    // Try the whole thing as a known glyph (e.g. "circle" after stripping would be empty)
    if (GLYPHS[name]) return { base: name, fill: false, slash: false }
  }
  if (n === '' && wrap) {
    // "circle.fill" → base circle filled
    return { base: wrap === 'circle' ? 'circle' : 'square', fill, slash }
  }
  return { base: n, fill, wrap, slash }
}

export function hasSymbol(name: string): boolean {
  const r = resolve(name)
  return !!GLYPHS[r.base]
}

export function Symbol({ name, style, className }: { name: string; style?: React.CSSProperties; className?: string }): JSX.Element {
  const r = resolve(name)
  const glyph = GLYPHS[r.base]
  const filled = r.fill || (glyph?.fill ?? false)
  if (!glyph) {
    return (
      <svg viewBox="0 0 24 24" className={className} style={style} aria-label={name}>
        <title>{name}</title>
        <rect x="4" y="4" width="16" height="16" rx="3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 2" />
        <text x="12" y="15" fontSize="9" textAnchor="middle" fill="currentColor" fontFamily="system-ui">
          ?
        </text>
      </svg>
    )
  }
  const inner = (
    <path
      d={glyph.d}
      fill={filled ? 'currentColor' : 'none'}
      stroke={filled && r.wrap ? 'var(--sw-symbol-bg, #fff)' : 'currentColor'}
      strokeWidth={filled ? (r.wrap ? 1.5 : 0) : 2}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  )
  if (r.wrap) {
    const shape = r.wrap === 'circle' ? <circle cx="12" cy="12" r="10.5" /> : <rect x="2.5" y="2.5" width="19" height="19" rx="4" />
    return (
      <svg viewBox="0 0 24 24" className={className} style={style} aria-label={name}>
        {React.cloneElement(shape, {
          fill: r.fill ? 'currentColor' : 'none',
          stroke: 'currentColor',
          strokeWidth: 2
        })}
        <g transform="translate(12 12) scale(0.6) translate(-12 -12)">
          {r.fill ? (
            <path d={glyph.d} fill="none" stroke="var(--sw-symbol-bg, #fff)" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
          ) : (
            inner
          )}
        </g>
        {r.slash && <path d="M4 4l16 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />}
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 24 24" className={className} style={style} aria-label={name}>
      {inner}
      {r.slash && <path d="M4 4l16 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />}
    </svg>
  )
}
