import type { StyleProp, ViewStyle } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

export type IconName = 'document-outline' | 'globe-outline' | 'lyrics-outline' | 'person-outline';

interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
  style?: StyleProp<ViewStyle>;
}

export default function Icon({ name, size = 24, color = '#000', style }: IconProps) {
  switch (name) {
    case 'document-outline':
      return (
        <Svg width={size} height={size} viewBox="0 0 512 512" style={style}>
          <Path d="M160 48h144l96 96v304a32 32 0 0 1-32 32H160a48 48 0 0 1-48-48V96a48 48 0 0 1 48-48Z" fill="none" stroke={color} strokeWidth={32} strokeLinejoin="round" />
          <Path d="M304 48v112h112M192 240h128M192 320h128M192 400h80" fill="none" stroke={color} strokeWidth={32} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      );
    case 'globe-outline':
      return (
        <Svg width={size} height={size} viewBox="0 0 512 512" style={style}>
          <Circle cx={256} cy={256} r={192} fill="none" stroke={color} strokeWidth={32} />
          <Path d="M64 256h384M256 64c56 52 88 120 88 192s-32 140-88 192c-56-52-88-120-88-192s32-140 88-192Z" fill="none" stroke={color} strokeWidth={32} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      );
    case 'lyrics-outline':
      return (
        <Svg width={size} height={size} viewBox="0 0 512 512" style={style}>
          <Path d="M64 128h160M64 224h160M64 320h112" fill="none" stroke={color} strokeWidth={32} strokeLinecap="round" />
          <Path d="M288 112v232M288 128l160-32v216" fill="none" stroke={color} strokeWidth={32} strokeLinecap="round" strokeLinejoin="round" />
          <Circle cx={232} cy={360} r={56} fill="none" stroke={color} strokeWidth={32} />
          <Circle cx={392} cy={328} r={56} fill="none" stroke={color} strokeWidth={32} />
        </Svg>
      );
    case 'person-outline':
      return (
        <Svg width={size} height={size} viewBox="0 0 512 512" style={style}>
          <Circle cx={256} cy={144} r={96} fill="none" stroke={color} strokeWidth={32} />
          <Path d="M80 464c0-97.2 78.8-176 176-176s176 78.8 176 176" fill="none" stroke={color} strokeWidth={32} strokeLinecap="round" />
        </Svg>
      );
    default:
      return null;
  }
}
