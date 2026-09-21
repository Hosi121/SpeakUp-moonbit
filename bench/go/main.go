// Corrected Go reference, not the racy legacy controller. Benchmark-only:
// admission is synthetic on BOTH runtimes, and the listener is loopback only.
package main

import (
 "encoding/json"
 "log"
 "net/http"
 "os"
 "strconv"
 "sync"
 "time"
 "github.com/gorilla/websocket"
)
type Peer struct { ws *websocket.Conn; user int; room int; write sync.Mutex }
type Room struct { peers []*Peer; phase int }
type Hub struct { sync.Mutex; rooms map[int]*Room }
var hub = Hub{rooms: map[int]*Room{}}
func send(p *Peer, data []byte) { p.write.Lock(); defer p.write.Unlock(); p.ws.SetWriteDeadline(time.Now().Add(5*time.Second)); if p.ws.WriteMessage(websocket.TextMessage,data)!=nil {p.ws.Close()} }
func valid(data []byte) (string, bool) {
 var m struct { Type string `json:"type"`; Offer json.RawMessage `json:"offer"`; Answer json.RawMessage `json:"answer"`; Candidate json.RawMessage `json:"candidate"` }
 if json.Unmarshal(data,&m)!=nil {return "",false}
 switch m.Type {
 case "offer","answer":
  raw:=m.Offer; if m.Type=="answer" {raw=m.Answer}
  var s struct {Type string `json:"type"`; SDP string `json:"sdp"`}
  if json.Unmarshal(raw,&s)!=nil || s.Type!=m.Type || len(s.SDP)==0 || len(s.SDP)>60000 {return "",false}
 case "ice-candidate":
  var c struct {Candidate *string `json:"candidate"`; SDPMid *string `json:"sdpMid"`; Line *int `json:"sdpMLineIndex"`; Fragment *string `json:"usernameFragment"`}
  if json.Unmarshal(m.Candidate,&c)!=nil || c.Candidate==nil || len(*c.Candidate)>4096 || (c.Line!=nil&&(*c.Line<0||*c.Line>65535)) {return "",false}
 default: return "",false
 }; return m.Type,true
}
func main(){
 up:=websocket.Upgrader{CheckOrigin:func(r *http.Request)bool{return true}}
 http.HandleFunc("/health",func(w http.ResponseWriter,r *http.Request){w.Write([]byte("ok"))})
 http.HandleFunc("/ws",func(w http.ResponseWriter,r *http.Request){
  rid,_:=strconv.Atoi(r.URL.Query().Get("room")); uid,_:=strconv.Atoi(r.URL.Query().Get("user"))
  if rid<=0||uid<=0 {http.Error(w,"bad",400);return}
  ws,err:=up.Upgrade(w,r,nil); if err!=nil{return}; defer ws.Close(); ws.SetReadLimit(65536)
  p:=&Peer{ws:ws,user:uid,room:rid}
  hub.Lock(); room:=hub.rooms[rid];if room==nil{room=&Room{};hub.rooms[rid]=room}
  if len(room.peers)>=2 || (len(room.peers)==1 && room.peers[0].user==uid){hub.Unlock();return}
  room.peers=append(room.peers,p)
  var ready []*Peer
  if len(room.peers)==2 {room.phase=1;ready=append(ready,room.peers...)}
  hub.Unlock()
  if len(ready)==2 {for _,x:=range ready {other:=ready[0];if other==x{other=ready[1]}; b,_:=json.Marshal(struct{Type string `json:"type"`; IsOffer bool `json:"isOffer"`}{"callType",x.user>other.user});send(x,b)}}
  defer func(){hub.Lock();defer hub.Unlock();room:=hub.rooms[rid];if room==nil{return};for i,x:=range room.peers{if x==p{room.peers=append(room.peers[:i],room.peers[i+1:]...);break}};room.phase=0;if len(room.peers)==0{delete(hub.rooms,rid)}}()
  for {_,data,err:=ws.ReadMessage();if err!=nil{return};kind,ok:=valid(data);if !ok{return}
   hub.Lock();room:=hub.rooms[rid];if room==nil||len(room.peers)!=2{hub.Unlock();return};other:=room.peers[0];if other==p{other=room.peers[1]}
   offer:=p.user>other.user
   if kind=="offer"{ok=offer&&room.phase==1;if ok{room.phase=2}}else if kind=="answer"{ok=!offer&&room.phase==2;if ok{room.phase=3}}
   hub.Unlock();if !ok{return};send(other,data)
  }
 })
 port:=os.Getenv("PORT");if port==""{port="18101"};log.Fatal(http.ListenAndServe("127.0.0.1:"+port,nil))
}
