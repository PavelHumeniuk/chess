import React, { useEffect, useRef } from 'react';
import './MoveHistory.css';

interface MoveHistoryProps {
    history: string[];
}

const MoveHistory: React.FC<MoveHistoryProps> = ({ history }) => {
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [history.length]);

    // Group moves into pairs (white, black)
    const movePairs: { number: number; white: string; black?: string }[] = [];
    for (let i = 0; i < history.length; i += 2) {
        movePairs.push({
            number: Math.floor(i / 2) + 1,
            white: history[i],
            black: history[i + 1],
        });
    }

    return (
        <div className="move-history" data-testid="move-history">
            <h3 className="move-history__title">Moves</h3>
            <div className="move-history__list" ref={scrollRef}>
                {movePairs.length === 0 && (
                    <div className="move-history__empty">No moves yet</div>
                )}
                {movePairs.map((pair) => (
                    <div key={pair.number} className="move-history__row">
                        <span className="move-history__number">{pair.number}.</span>
                        <span className="move-history__move move-history__move--white">{pair.white}</span>
                        <span className="move-history__move move-history__move--black">{pair.black || ''}</span>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default MoveHistory;
