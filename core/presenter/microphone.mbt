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
priv enum MicrophonePhase {
  Stopped
  Acquiring
  Capturing(StreamPort)
  Sampling(AudioInput)
  Checked
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
  let phase : Ref[MicrophonePhase] = Ref(Stopped)
  let frame = Ref(noop)
  let unwatch = Ref(noop)
  let stop = fn() {
    let previous = phase.val
    phase.val = if previous is Checked { Checked } else { Stopped }
    generation.val += 1
    (frame.val)()
    frame.val = noop
    (unwatch.val)()
    unwatch.val = noop
    match previous {
      Capturing(stream) => (stream.close)()
      Sampling(audio) => audio.close()
      Stopped | Acquiring | Checked => ()
    }
  }
  fn sample() {
    (frame.val)()
    frame.val = noop
    guard phase.val is Sampling(audio) && (realtime.visible)() else { return }
    let current = generation.val
    state.set({
      ..state.value,
      levels: microphone_levels((audio.meter.sample)()),
    })
    if current == generation.val && phase.val is Sampling(_) {
      frame.val = (media.frame)(sample)
    }
  }
  {
    get_snapshot: fn() { state.value },
    subscribe: fn(listener) { state.subscribe(listener) },
    stop,
    start: fn() {
      guard phase.val is Stopped else { return }
      phase.val = Acquiring
      generation.val += 1
      let current = generation.val
      state.set({ ..state.value, ready: false, error: "", })
      unwatch.val = (realtime.on_focus)(sample)
      (media.acquire)(
        fn(stream) {
          guard current == generation.val && phase.val is Acquiring else {
            (stream.close)()
            return
          }
          phase.val = Capturing(stream)
          let audio : AudioInput = { stream, meter: (stream.meter)(2048), }
          if current != generation.val {
            audio.close()
            return
          }
          phase.val = Sampling(audio)
          state.set({ ..state.value, ready: true, })
          sample()
        },
        fn(_) {
          if current != generation.val {
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
        phase.val = Checked
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
