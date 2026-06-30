import { ref } from 'vue';

// Module-level singletons so every import shares the same state
const _msg     = ref('');
const _type    = ref('success');
const _visible = ref(false);
let _timer = null;

export function useToast() {
  function toast(msg, type = 'success') {
    _msg.value     = msg;
    _type.value    = type;
    _visible.value = true;
    clearTimeout(_timer);
    _timer = setTimeout(() => { _visible.value = false; }, 3500);
  }
  return { msg: _msg, type: _type, visible: _visible, toast };
}
