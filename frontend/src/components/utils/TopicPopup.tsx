import { Card, CardContent, Typography, List, ListItem, ListItemText, IconButton } from "@mui/material";
import { Close } from "@mui/icons-material";

type TopicPopupProps = {
  isVisible: boolean;
  onClose: () => void;
  topics: string[];
};

export const TopicPopup = ({ isVisible, onClose, topics }: TopicPopupProps) => {
  if (!isVisible) {
    return null;
  }
  return (
    <Card sx={{ width: "80vw", border: "2px solid #e91e63", borderRadius: "16px", p: 1, position: "fixed", bottom: "0", left: "50%", transform: "translate(-50%, -50%)" }}>
      <CardContent>
        <IconButton
          aria-label="close"
          onClick={onClose}
          sx={{
            position: "absolute",
            right: 8,
            top: 8,
            color: "#e91e63",
          }}
        >
          <Close />
        </IconButton>
        <Typography variant="h6" color="primary.main" gutterBottom textAlign="left" width="90%">
          まだ話していないトピックはありますか？
        </Typography>
        {topics.length === 0 && <Typography>この通話には指定されたトピックがありません。</Typography>}
        <List sx={{ height: "20vh" }}>
          {topics.map((topic, index) => (
            <ListItem key={index} sx={{ height: "30%" }}>
              <ListItemText primary={topic} />
            </ListItem>
          ))}
        </List>
      </CardContent>
    </Card>
  );
};
