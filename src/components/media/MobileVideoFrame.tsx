import React from 'react';
import type { Profile } from '../../types/domain';
import { CreatorAvatar } from '../profile/CreatorAvatar';

export type VideoCreator = Pick<Profile, 'name' | 'avatar'> & Partial<Pick<Profile, 'id'>>;

/** Keep identity and source outside the player, including virtualized clips. */
export function MobileVideoFrame({ creator, sourceTitle, children }: {
  creator?: VideoCreator;
  sourceTitle: string;
  children: React.ReactNode;
}) {
  return <div className="mobile-video-frame">
    {creator && <div className="mobile-video-creator">
      <CreatorAvatar name={creator.name} avatar={creator.avatar} shape="squircle" />
      <span>{creator.name}</span>
    </div>}
    <div className="mobile-video-frame-media">{children}</div>
    <p className="mobile-video-source-title">{sourceTitle}</p>
  </div>;
}
