/**
 * compat.js — browser/backend compatibility shims for the WebGPU path.
 *
 * Everything here is feature-detected and self-disabling. None of it changes
 * behaviour on a browser that implements the current spec, so these can stay in
 * the shipping build indefinitely without becoming lies.
 */

/**
 * GPUTextureViewDescriptor.swizzle changed shape mid-spec.
 *
 * three r185+ passes the STRING form (`swizzle: 'rgba'`). Browsers that shipped
 * the earlier draft — which includes Safari point releases in the wild and
 * Chromium builds through at least 151 — expect a GPUTextureComponentSwizzle
 * DICTIONARY (`{r:'r', g:'g', b:'b', a:'a'}`) and throw a TypeError on every
 * single createView() otherwise. Because three calls createView() to build the
 * render pass descriptor, one unhandled throw means a permanently black screen.
 *
 * Detect once against the real device, then translate string -> dictionary in
 * place (three re-sets the field to 'rgba' on every reuse of its pooled
 * descriptor, so mutating it is safe and allocation-free). If the browser
 * understands neither form, drop the key — three only ever uses the identity
 * swizzle, so removing it is semantically a no-op.
 *
 * @param {GPUDevice} device
 * @returns {'native'|'string->dict'|'stripped'|'unavailable'}
 */
export function installTextureViewCompat(device) {
  if (!device || typeof device.createTexture !== 'function') return 'unavailable';
  let probe;
  try {
    probe = device.createTexture({
      size: [1, 1], format: 'rgba8unorm',
      usage: (globalThis.GPUTextureUsage?.TEXTURE_BINDING) ?? 0x04,
    });
  } catch (e) {
    return 'unavailable';
  }

  const done = (r) => { try { probe.destroy(); } catch (e) { /* ignore */ } return r; };

  try { probe.createView({ swizzle: 'rgba' }); return done('native'); }
  catch (e) { /* fall through */ }

  let dictOk = true;
  try { probe.createView({ swizzle: { r: 'r', g: 'g', b: 'b', a: 'a' } }); }
  catch (e) { dictOk = false; }

  const proto = Object.getPrototypeOf(probe);
  if (proto.__zsSwizzlePatched) return done(dictOk ? 'string->dict' : 'stripped');
  const original = proto.createView;
  const cache = new Map();
  const toDict = (s) => {
    let d = cache.get(s);
    if (!d) {
      const c = String(s);
      d = { r: c[0] || 'r', g: c[1] || 'g', b: c[2] || 'b', a: c[3] || 'a' };
      cache.set(s, d);
    }
    return d;
  };

  proto.createView = function patchedCreateView(desc) {
    if (desc && typeof desc.swizzle === 'string') {
      if (dictOk) {
        desc.swizzle = toDict(desc.swizzle);
      } else {
        const copy = {};
        for (const k in desc) if (k !== 'swizzle') copy[k] = desc[k];
        return original.call(this, copy);
      }
    }
    return original.call(this, desc);
  };
  proto.__zsSwizzlePatched = true;

  return done(dictOk ? 'string->dict' : 'stripped');
}

/**
 * Dawn (and therefore Chromium's WebGPU) can resolve `device.lost` spuriously in
 * some sandboxed/headless configurations while rendering continues perfectly
 * well. Treating that as fatal would tear down a working session, so we record
 * it and only act if the device *also* stops accepting work.
 *
 * @param {GPUDevice} device
 * @param {(info:{reason:string,message:string})=>void} onReallyLost
 */
export function watchDeviceLost(device, onReallyLost) {
  if (!device?.lost) return () => {};
  let flagged = null;
  let cancelled = false;
  device.lost.then((info) => {
    flagged = { reason: info.reason ?? 'unknown', message: info.message ?? '' };
  });
  // Confirm with a cheap round-trip before believing it.
  const confirm = async () => {
    if (cancelled || !flagged) return;
    try {
      const b = device.createBuffer({ size: 4, usage: 0x0008 | 0x0001 }); // COPY_DST | MAP_READ
      b.destroy();
    } catch (e) {
      onReallyLost?.(flagged);
      return;
    }
    flagged = null;
  };
  const id = setInterval(confirm, 2000);
  return () => { cancelled = true; clearInterval(id); };
}

/**
 * Pick the backend and report what we actually got, so the HUD/harness can say
 * so out loud rather than silently running the slow path.
 * @param {{isWebGPUBackend?:boolean}} backend
 */
export function backendName(backend) {
  if (!backend) return 'unknown';
  if (backend.isWebGPUBackend) return 'webgpu';
  if (backend.isWebGLBackend) return 'webgl2';
  return 'unknown';
}
