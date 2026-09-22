///|
/// TS2Mbt 0.6.0 represents zero-argument callbacks as opaque types. This
/// concrete conversion matches that one callback signature, without a generic cast.
fn activity_listener(value : () -> Unit) -> @browser.OnActivityListenerCallback = "%identity"

///|
pub fn create_browser(peer : String) -> ThreadController {
  create_controller(@browser.numberValue(peer), {
    request: @browser.requestText,
    random_id: @browser.randomId,
    format_time: @browser.formatTime,
    is_visible: @browser.isVisible,
    on_visibility: @browser.onVisibility,
    on_activity: fn(listener) {
      @browser.onActivity(activity_listener(listener))
    },
  })
}
