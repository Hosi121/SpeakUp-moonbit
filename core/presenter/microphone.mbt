///|
pub(all) struct MicrophoneView {
  levels : Array[Double]
  error : String
  ready : Bool
  checked : Bool
}

///|
pub(all) struct MicrophoneController {
  get_snapshot : () -> MicrophoneView
  subscribe : (() -> Unit) -> () -> Unit
  start : () -> Unit
  stop : () -> Unit
  finish : () -> Unit
}

///|
pub fn create_microphone(
  media : MediaPorts,
  realtime : RealtimePorts,
) -> MicrophoneController {
  let state = store(MicrophoneView::{
    levels: Array::make(10, 0.0),
    error: "",
    ready: false,
    checked: false,
  })
  let generation = Ref(0)
  let active = Ref(false)
  let stream : Ref[StreamPort?] = Ref(None)
  let meter : Ref[MeterPort?] = Ref(None)
  let frame = Ref(noop)
  let unwatch = Ref(noop)
  let stop = fn() {
    active.val = false
    generation.val += 1
    (frame.val)()
    frame.val = noop
    (unwatch.val)()
    unwatch.val = noop
    if stream.val is Some(value) {
      (value.close)()
    }
    stream.val = None
    if meter.val is Some(value) {
      (value.close)()
    }
    meter.val = None
  }
  fn sample() {
    (frame.val)()
    frame.val = noop
    if !active.val || !(realtime.visible)() {
      return
    }
    guard meter.val is Some(meter) else { return }
    let levels = microphone_levels((meter.sample)())
    state.set({ ..state.value, levels, })
    if !active.val {
      return
    }
    frame.val = (media.frame)(sample)
  }
  {
    get_snapshot: fn() { state.value },
    subscribe: fn(listener) { state.subscribe(listener) },
    stop,
    start: fn() {
      if active.val || state.value.checked {
        return
      }
      active.val = true
      generation.val += 1
      let current = generation.val
      state.set({ ..state.value, ready: false, error: "", })
      unwatch.val = (realtime.on_focus)(sample)
      (media.acquire)(
        fn(value) {
          if !active.val || current != generation.val {
            (value.close)()
            return
          }
          stream.val = Some(value)
          meter.val = Some((value.meter)(2048))
          state.set({ ..state.value, ready: true, })
          sample()
        },
        fn(_) {
          if !active.val || current != generation.val {
            return
          }
          stop()
          state.set({
            ..state.value,
            ready: false,
            error: "マイクへのアクセスが拒否されました。ブラウザの設定を確認してください。",
          })
        },
      )
    },
    finish: fn() {
      if state.value.ready {
        stop()
        state.set({ ..state.value, checked: true, })
      }
    },
  }
}

///|
pub fn microphone_levels(data : Array[Double]) -> Array[Double] {
  let band = (data.length().to_double() * 0.7 / 10).to_int().max(1)
  let levels = Array::make(10, 0.02)
  for i in 0..<10 {
    let mut sum = 0.0
    for j in (i * band)..<((i + 1) * band) {
      sum += data.get(j).unwrap_or(0.0)
    }
    levels[i] = (sum / band.to_double() / 255).min(1).max(0.02)
  }
  levels
}
