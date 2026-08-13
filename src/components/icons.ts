import type { ComponentType } from 'react';

type IconWeight = 'thin' | 'light' | 'regular' | 'bold' | 'fill' | 'duotone';

export type PhosphorIconProps = {
  size?: number;
  color?: string;
  weight?: IconWeight;
};

type IconComponent = ComponentType<PhosphorIconProps>;

export const ArrowDown: IconComponent = require('phosphor-react-native/lib/commonjs/icons/ArrowDown').ArrowDown;
export const ArrowRight: IconComponent = require('phosphor-react-native/lib/commonjs/icons/ArrowRight').ArrowRight;
export const ArrowUpRight: IconComponent = require('phosphor-react-native/lib/commonjs/icons/ArrowUpRight').ArrowUpRight;
export const ArrowUp: IconComponent = require('phosphor-react-native/lib/commonjs/icons/ArrowUp').ArrowUp;
export const CaretDown: IconComponent = require('phosphor-react-native/lib/commonjs/icons/CaretDown').CaretDown;
export const CaretLeft: IconComponent = require('phosphor-react-native/lib/commonjs/icons/CaretLeft').CaretLeft;
export const ChatCircleText: IconComponent = require('phosphor-react-native/lib/commonjs/icons/ChatCircleText').ChatCircleText;
export const CheckSquare: IconComponent = require('phosphor-react-native/lib/commonjs/icons/CheckSquare').CheckSquare;
export const Code: IconComponent = require('phosphor-react-native/lib/commonjs/icons/Code').Code;
export const Copy: IconComponent = require('phosphor-react-native/lib/commonjs/icons/Copy').Copy;
export const DotsThreeVertical: IconComponent = require('phosphor-react-native/lib/commonjs/icons/DotsThreeVertical').DotsThreeVertical;
export const Lightbulb: IconComponent = require('phosphor-react-native/lib/commonjs/icons/Lightbulb').Lightbulb;
export const List: IconComponent = require('phosphor-react-native/lib/commonjs/icons/List').List;
export const Microphone: IconComponent = require('phosphor-react-native/lib/commonjs/icons/Microphone').Microphone;
export const NotePencil: IconComponent = require('phosphor-react-native/lib/commonjs/icons/NotePencil').NotePencil;
export const PaperPlaneRight: IconComponent = require('phosphor-react-native/lib/commonjs/icons/PaperPlaneRight').PaperPlaneRight;
export const Plus: IconComponent = require('phosphor-react-native/lib/commonjs/icons/Plus').Plus;
export const SignOut: IconComponent = require('phosphor-react-native/lib/commonjs/icons/SignOut').SignOut;
export const UserCircle: IconComponent = require('phosphor-react-native/lib/commonjs/icons/UserCircle').UserCircle;
export const SlidersHorizontal: IconComponent = require('phosphor-react-native/lib/commonjs/icons/SlidersHorizontal').SlidersHorizontal;
export const SpeakerHigh: IconComponent = require('phosphor-react-native/lib/commonjs/icons/SpeakerHigh').SpeakerHigh;
export const Stop: IconComponent = require('phosphor-react-native/lib/commonjs/icons/Stop').Stop;
export const ThumbsUp: IconComponent = require('phosphor-react-native/lib/commonjs/icons/ThumbsUp').ThumbsUp;
export const Trash: IconComponent = require('phosphor-react-native/lib/commonjs/icons/Trash').Trash;
