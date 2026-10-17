export const DEMO_CLIPS = [
  { id: 'echo-demo-low', name: 'low ROM.mov' },
  { id: 'echo-demo-low-med', name: 'low med ROM.mov' },
  { id: 'echo-demo-high', name: 'high ROM.mov' },
  { id: 'echo-demo-higher', name: 'higher ROM.mov' },
].map((v) => ({
  ...v,
  url: `${import.meta.env.BASE_URL}demo%20recordings/${encodeURIComponent(v.name)}`,
}));
