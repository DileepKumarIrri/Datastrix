
import React, { useState, useEffect } from 'react';

const statuses = [
    "Thinking...",
    "Retrieving context...",
    "Generating response..."
];

const GeneratingStatusIndicator: React.FC = () => {
    const [statusIndex, setStatusIndex] = useState(0);

    useEffect(() => {
        // This effect simulates a realistic, sequential progression of the AI's task.
        // It moves through stages and then stays at the final one, providing better
        // user feedback than a simple loop.
        
        // 1. After 1.5s, move from "Thinking..." to "Retrieving context..."
        const timeout1 = setTimeout(() => {
            setStatusIndex(1);
        }, 1500);

        // 2. After another 2s, move to the final "Generating response..." stage.
        const timeout2 = setTimeout(() => {
            setStatusIndex(2);
        }, 3500); // Total time: 1.5s + 2s

        // The cleanup function is crucial. It prevents state updates on an unmounted
        // component, which happens if the AI responds faster than the animation completes.
        return () => {
            clearTimeout(timeout1);
            clearTimeout(timeout2);
        };
    }, []); // The empty dependency array ensures this effect runs only once on mount.

    return (
        <div className="typing-indicator-container">
            <span>{statuses[statusIndex]}</span>
            <div className="typing-indicator"><span></span><span></span><span></span></div>
        </div>
    );
};

export default GeneratingStatusIndicator;
