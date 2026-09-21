package main
import ("encoding/json";"os";"strings")
type Message struct {
	Type      string          `json:"type"`
	Offer     json.RawMessage `json:"offer,omitempty"`
	Answer    json.RawMessage `json:"answer,omitempty"`
	Candidate json.RawMessage `json:"candidate,omitempty"`
	Token     string          `json:"token,omitempty"`
	IsOffer   bool            `json:"isOffer,omitempty"`
}
func normalizeAvatarURL(raw string) string {
	if raw == "" {
		return ""
	}
	if strings.HasPrefix(raw, "http://") || strings.HasPrefix(raw, "https://") {
		return raw
	}
	return "http://localhost:8081" + raw
}

func main(){
 var input struct { Avatars []string; Messages []Message }; json.NewDecoder(os.Stdin).Decode(&input)
 avatars := []string{}; for _, v := range input.Avatars { avatars=append(avatars,normalizeAvatarURL(v)) }; json.NewEncoder(os.Stdout).Encode(map[string]interface{}{"avatars":avatars,"messages":input.Messages})
}
