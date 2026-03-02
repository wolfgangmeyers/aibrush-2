import { FC, useEffect, useState } from "react";
import { NanoGPTGenerator } from "../lib/nanogptgenerator";

interface Props {
    generator: NanoGPTGenerator;
}

export const NanoGPTBalance: FC<Props> = ({ generator }) => {
    const [balance, setBalance] = useState<number | null>(generator.lastKnownBalance);

    useEffect(() => {
        const interval = setInterval(() => {
            setBalance(generator.lastKnownBalance);
        }, 2_000);
        return () => clearInterval(interval);
    }, [generator]);

    if (balance === null) return null;

    const formatted = balance.toLocaleString('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 4,
    });

    return (
        <div style={{ color: "#00f0f0", marginTop: "16px" }}>
            <span>Balance: </span>
            <span>{formatted}</span>
        </div>
    );
};
