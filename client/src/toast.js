// 輕量全域 toast 通知（非阻塞）
export function toast(message, type = 'info') {
  window.dispatchEvent(
    new CustomEvent('app-toast', {
      detail: { message, type, id: Date.now() + '_' + Math.random().toString(36).slice(2) }
    })
  );
}
