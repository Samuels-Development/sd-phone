import { BadgeCheck } from 'lucide-react';

import { GRAD_FROM, type VUser } from '../data';

export interface LiveComment { id: string; user: VUser; text: string }

export function LiveCommentRow({ comment }: { comment: LiveComment }) {
    return (
        <div className="flex items-start gap-2" style={{ animation: 'live-comment-in 0.25s ease-out' }}>
            <img src={comment.user.avatar} alt="" draggable={false} className="mt-[1px] h-[28px] w-[28px] shrink-0 rounded-full object-cover" />
            <div className="min-w-0 text-[14px] leading-snug" style={{ textShadow: '0 1px 3px rgba(0,0,0,0.7)' }}>
                <span className="inline-flex items-center gap-1 font-semibold">
                    {comment.user.handle}
                    {comment.user.verified && (
                        <BadgeCheck className="h-[13px] w-[13px]" style={{ color: GRAD_FROM, fill: GRAD_FROM }} stroke="#000" strokeWidth={1.6} />
                    )}
                </span>
                <span className="ml-1.5 text-white/95">{comment.text}</span>
            </div>
        </div>
    );
}
