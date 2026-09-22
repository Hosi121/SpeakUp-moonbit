///|
fn activity_callback(value : () -> Unit) -> @browser.OnActivityListenerCallback = "%identity"

///|
fn timer_callback(value : () -> Unit) -> @browser.TimeoutCallbackCallback = "%identity"

///|
pub fn browser_ports() -> AppPorts {
  {
    request: @browser.requestText,
    now: @browser.now,
    number: @browser.numberValue,
    date: @browser.dateValue,
    iso: @browser.isoDate,
    encode: @browser.encode,
    random_id: @browser.randomId,
    navigate: @browser.go,
    token: @browser.token,
    store_token: @browser.storeToken,
    timeout: fn(delay, callback) {
      @browser.timeout(delay, timer_callback(callback))
    },
    on_activity: fn(callback) {
      @browser.onActivity(activity_callback(callback))
    },
  }
}
