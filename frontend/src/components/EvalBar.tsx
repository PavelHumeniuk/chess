import React from 'react';
import './EvalBar.css';

interface EvalBarProps {
    score: {
        score: number;
        mate: number | null;
    };
    show: boolean;
}

const EvalBar: React.FC<EvalBarProps> = ({ score: evalData, show }) => {
    if (!show) return null;

    const { score, mate } = evalData;
    
    // Calculate visual percentage
    let whitePercentage = 50;
    let displayText = "";

    if (mate !== null) {
        whitePercentage = mate > 0 ? 100 : 0;
        displayText = `M${Math.abs(mate)}`;
    } else {
        const cappedScore = Math.max(-1000, Math.min(1000, score));
        whitePercentage = 50 + (cappedScore / 1000) * 50;
        const scoreVal = score / 100;
        displayText = scoreVal > 0 ? `+${scoreVal.toFixed(1)}` : scoreVal.toFixed(1);
    }

    return (
        <div className="eval-bar">
            {whitePercentage <= 50 ? (
                <span className="eval-bar__text eval-bar__text--top">{displayText}</span>
            ) : (
                <span className="eval-bar__text eval-bar__text--bottom">{displayText}</span>
            )}
            <div className="eval-bar__white" style={{ height: `${whitePercentage}%` }} />
        </div>
    );
};

export default EvalBar;
