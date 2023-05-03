import React from "react";
import { Card, Button } from "react-bootstrap";

import "./PricingCard.css";

interface PricingCardProps {
    title: string;
    price: number;
    description: string;
    buttonText: string;
    onButtonClick: () => void;
}

const PricingCard: React.FC<PricingCardProps> = ({
    title,
    price,
    description,
    buttonText,
    onButtonClick,
}) => {
    return (
        <Card style={{ width: "18rem", textAlign: "center" }} className="mb-4">
            <Card.Body>
                <Card.Text style={{textAlign: "right", marginBottom: "8px"}}>
                    <h3>${price}</h3>
                </Card.Text>
                <Card.Title style={{textAlign: "left", marginTop: "0px", marginBottom: "24px"}}>
                    <i
                        style={{fontSize: "40px", paddingRight: "8px"}}
                        className={`font-weight-bold gradient-title`}
                    >
                        {title}
                    </i>
                </Card.Title>
                <Card.Text>
                    {description}
                </Card.Text>
                <Button variant="primary" onClick={onButtonClick}>
                    {buttonText}
                </Button>
            </Card.Body>
        </Card>
    );
};

export default PricingCard;
