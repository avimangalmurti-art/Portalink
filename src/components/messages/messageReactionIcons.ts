import { HeartIcon, HandIcon, SparklesIcon, MessageCircleIcon } from 'lucide-react';

/** Keep existing reaction identifiers compatible with stored messages. */
export const MESSAGE_REACTION_OPTIONS = [
  { value: '❤', label: 'Love', icon: HeartIcon },
  { value: '👏', label: 'Applause', icon: HandIcon },
  { value: '✨', label: 'Sparkle', icon: SparklesIcon },
] as const;
export function messageReactionOption(value: string) {
  return MESSAGE_REACTION_OPTIONS.find(option => option.value === value)
    ?? { value, label: 'Other reaction', icon: MessageCircleIcon };
}
