const sessions = new Map();
export function initialReader(paperId, fingerprint) {
  const saved = sessions.get(paperId);
  if (saved?.fingerprint === fingerprint) return saved;
  let preferences = {};
  try { preferences = JSON.parse(localStorage.getItem(`recall-reader:${paperId}:${fingerprint}`)) || {}; } catch { /* optional storage */ }
  return { fingerprint, page: preferences.page || 1, showHighlights: preferences.showHighlights ?? true, context: null, teacherOpen: false, annotations: [], messages: [], diagrams: [] };
}
export function readerReducer(state, action) {
  switch (action.type) {
    case 'select': return { ...state, context: action.context };
    case 'page': return { ...state, page: action.page };
    case 'teacher': return { ...state, teacherOpen: action.open };
    case 'highlights': return { ...state, showHighlights: !state.showHighlights };
    case 'message': return { ...state, messages: [...state.messages, action.message] };
    case 'result': return { ...state, messages: [...state.messages, action.message], annotations: [...state.annotations, ...action.annotations], diagrams: [...state.diagrams, ...action.diagrams] };
    case 'remove': return { ...state, annotations: state.annotations.filter(a => a.id !== action.id), diagrams: state.diagrams.filter(d => d.id !== action.id) };
    case 'clear': return { ...state, annotations: [], diagrams: [] };
    default: return state;
  }
}
export function saveReader(paperId, state) {
  sessions.set(paperId, state);
  try { localStorage.setItem(`recall-reader:${paperId}:${state.fingerprint}`, JSON.stringify({ page: state.page, showHighlights: state.showHighlights })); } catch { /* in-memory session still works */ }
}
export function relativeRect(rect, page) {
  const x = Math.max(rect.left, page.left), y = Math.max(rect.top, page.top);
  const right = Math.min(rect.right, page.right), bottom = Math.min(rect.bottom, page.bottom);
  if (right <= x || bottom <= y) return null;
  return { x: (x - page.left) / page.width, y: (y - page.top) / page.height, width: (right - x) / page.width, height: (bottom - y) / page.height };
}
