// Cross-platform alert.
//
// React Native's `Alert.alert` is a NO-OP under react-native-web — on the web
// build it renders nothing, so any error or permission message surfaced through
// it is invisible (the button just stops spinning and "nothing happens"). This
// routes to the browser's native `window.alert` on web and to RN's `Alert`
// everywhere else, so failures are always visible to the user.
import { Alert, Platform } from "react-native";

export function notify(title: string, message?: string) {
  if (Platform.OS === "web") {
    if (typeof window !== "undefined" && typeof window.alert === "function") {
      window.alert(message ? `${title}\n\n${message}` : title);
    }
    return;
  }
  Alert.alert(title, message);
}
