<script setup>
import { ref, watch, onUnmounted } from 'vue';
import { useToast } from '@/composables/useToast.js';

const props = defineProps({ show: Boolean });
const emit  = defineEmits(['detected', 'close']);

const { toast } = useToast();
const videoRef  = ref(null);
let stream      = null;
let animId      = null;

async function openCamera() {
  if (!('BarcodeDetector' in window)) {
    toast('Camera scanning not supported on this browser — type IMEI manually', 'error');
    emit('close');
    return;
  }
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } },
    });
    videoRef.value.srcObject = stream;
    await new Promise(r => { videoRef.value.onloadedmetadata = r; });
    videoRef.value.play();

    const detector = new BarcodeDetector({
      formats: ['code_128', 'code_39', 'ean_13', 'ean_8', 'upc_a', 'upc_e', 'qr_code'],
    });

    const scan = async () => {
      if (!stream) return;
      try {
        const barcodes = await detector.detect(videoRef.value);
        if (barcodes.length) {
          closeCamera();
          emit('detected', barcodes[0].rawValue);
          return;
        }
      } catch { /* detection error on this frame, continue */ }
      if (stream) animId = requestAnimationFrame(scan);
    };
    animId = requestAnimationFrame(scan);
  } catch {
    toast('Camera access denied — allow camera permission and try again', 'error');
    emit('close');
  }
}

function closeCamera() {
  if (animId) { cancelAnimationFrame(animId); animId = null; }
  if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
  emit('close');
}

watch(() => props.show, open => {
  if (open) openCamera();
  else closeCamera();
}, { immediate: false });

onUnmounted(() => closeCamera());
</script>

<template>
  <Teleport to="body">
    <div
      v-if="show"
      style="position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:300;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;"
      @click.self="closeCamera"
    >
      <div style="width:100%;max-width:480px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
          <div style="color:#fff;font-size:15px;font-weight:700;display:flex;align-items:center;gap:8px;">
            <svg style="width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;color:#fff;" aria-hidden="true"><use href="#ic-scan"/></svg>
            Scanning…
          </div>
          <button
            @click="closeCamera"
            style="background:rgba(255,255,255,.15);border:none;color:#fff;padding:6px 14px;border-radius:8px;font-size:13px;cursor:pointer;"
          >Close</button>
        </div>
        <video
          ref="videoRef"
          style="width:100%;border-radius:12px;background:#000;aspect-ratio:4/3;object-fit:cover;display:block;"
          muted
          playsinline
        />
        <p style="color:rgba(255,255,255,.6);font-size:12px;text-align:center;margin-top:10px;">
          Point the camera at a barcode or QR code
        </p>
      </div>
    </div>
  </Teleport>
</template>
