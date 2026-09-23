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
  Acquiring(@lifetime.Lifetime)
  Sampling(@lifetime.Lifetime, MeterPort)
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
  let phase : Ref[MicrophonePhase] = Ref(Stopped)
  let frame : Ref[@lifetime.Release?] = Ref(None)
  let stop = fn() {
    let previous = phase.val
    phase.val = if previous is Checked { Checked } else { Stopped }
    match previous {
      Acquiring(life) | Sampling(life, _) => life.close()
      Stopped | Checked => ()
    }
    frame.val = None
  }
  let failed = fn(life : @lifetime.Lifetime) {
    if life.is_open() {
      stop()
      state.set({
        ..state.value,
        ready: false,
        error: "マイクを利用できませんでした。ブラウザの設定を確認してください。",
      })
    }
  }
  fn sample() {
    if frame.val is Some(pending) {
      frame.val = None
      pending.close()
    }
    guard phase.val is Sampling(life, meter) && life.is_open() else { return }
    try {
      if !@browser_async.guard_sync(realtime.visible) {
        return
      }
      let data = @browser_async.guard_sync(meter.sample)
      if !life.is_open() {
        return
      }
      state.set({ ..state.value, levels: microphone_levels(data), })
      if life.is_open() {
        let cancel = @browser_async.guard_sync(fn() { (media.frame)(sample) })
        frame.val = Some(life.own(cancel))
      }
    } catch {
      _ => failed(life)
    }
  }
  {
    get_snapshot: fn() { state.value },
    subscribe: fn(listener) { state.subscribe(listener) },
    stop,
    start: fn() {
      guard phase.val is Stopped else { return }
      let life = @lifetime.Lifetime()
      phase.val = Acquiring(life)
      state.set({ ..state.value, ready: false, error: "", })
      if !life.is_open() {
        return
      }
      try {
        let unwatch = @browser_async.guard_sync(fn() {
          (realtime.on_focus)(sample)
        })
        ignore(life.own(unwatch))
        if !life.is_open() {
          return
        }
        @browser_async.guard_sync(fn() {
          (media.acquire)(
            fn(stream) {
              if !life.is_open() || !(phase.val is Acquiring(_)) {
                (stream.close)()
                return
              }
              ignore(life.own(stream.close))
              try {
                let meter = @browser_async.guard_sync(fn() {
                  (stream.meter)(2048)
                })
                ignore(life.own(meter.close))
                if !life.is_open() {
                  return
                }
                phase.val = Sampling(life, meter)
                state.set({ ..state.value, ready: true, })
                if life.is_open() {
                  sample()
                }
              } catch {
                _ => failed(life)
              }
            },
            fn(_) { failed(life) },
          )
        })
      } catch {
        _ => failed(life)
      }
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
