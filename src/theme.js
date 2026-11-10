/* Zuari brand palette — matches the main ZIBIL website (premium.css) */
export const Z = {
  ink950: '#050b1a',
  ink900: '#081428',
  ink800: '#0c1f3d',
  ink700: '#12305c',
  gold: '#d8b26a',
  goldDeep: '#b8913f',
  goldSoft: '#f6ecd6',
  azure: '#2f7bff',
  azureSoft: '#e8f0ff',
  teal: '#19b9a6',
  tealSoft: '#e2f7f3',
  amber: '#e9962f',
  amberSoft: '#fdf1df',
  rose: '#e5566d',
  roseSoft: '#fdebee',
  bg: '#eef2f9',
  line: '#e3e9f3',
  text: '#0c1a33',
  muted: '#5f6f88',
};

export const CHART_COLORS = ['#2f7bff', '#19b9a6', '#d8b26a', '#e9962f', '#e5566d', '#7b8cff', '#0c1f3d', '#5bc8f5', '#b8913f', '#9aa8bf'];

export const headerStyle = {
  background: `radial-gradient(40rem 12rem at 85% -40%, rgba(47,123,255,.35), transparent 70%), linear-gradient(120deg, ${Z.ink950}, ${Z.ink800} 60%, ${Z.ink700})`,
  color: 'white',
  padding: '14px 26px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  position: 'sticky',
  top: 0,
  zIndex: 50,
  borderBottom: `2px solid ${Z.gold}`,
  boxShadow: '0 10px 30px -18px rgba(5,11,26,.8)',
};
