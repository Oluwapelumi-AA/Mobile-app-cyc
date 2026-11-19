// phosphor-react-native's icon base passes `className` to <Svg> (for web).
// react-native-svg's types don't list it, which breaks `tsc` on the icon sources.
import "react-native-svg";

declare module "react-native-svg" {
  interface SvgProps {
    className?: string;
  }
}
