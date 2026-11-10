// Phone Return inserts a line; the Send button or Ctrl/Cmd+Enter sends it.
export function shouldSendOnEnter(event, touch=matchMedia('(pointer:coarse)').matches){
 return !!(event.key==='Enter'&&!event.shiftKey&&!event.isComposing&&event.keyCode!==229&&(!touch||event.ctrlKey||event.metaKey));
}
