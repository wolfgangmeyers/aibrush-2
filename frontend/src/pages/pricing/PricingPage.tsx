import { FC, useState } from "react";
import { Row, Col, Form, Button } from "react-bootstrap";
import { AIBrushApi } from "../../client";
import PricingCard from "./PricingCard";

import "./PricingPage.css";
import RedeemPopup from "./RedeemPopup";

interface Props {
    api: AIBrushApi;
}

export const PricingPage: FC<Props> = ({api}) => {

    const [code, setCode] = useState<string>("");
    const [redeemingState, setRedeemingState] = useState<"busy" | "success" | "failure" | undefined>(undefined);

    const handleRedeemCode = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setRedeemingState("busy");
        setCode("");
        api.redeemDepositCode(code).then(() => {
            setRedeemingState("success");
        }).catch(() => {
            setRedeemingState("failure");
        });
    };

    return (
        <>
            <h2>Unlock the Power of AI</h2>
            <div
                style={{
                    display: "flex",
                    justifyContent: "center",
                    marginTop: "40px",
                }}
            >
                <p
                    style={{
                        fontSize: "20px",
                        textAlign: "center",
                    }}
                    className="pricing-page-desc"
                >
                    Generate stunning images with our state-of-the-art Stable
                    Diffusion AI with over 100 models to choose from. Purchase
                    credits to create your unique masterpieces without breaking
                    the bank. Choose from our flexible credit packages and get
                    started today!
                </p>
            </div>
            <Row
                className="justify-content-center"
                style={{ maxWidth: "1200px", margin: "64px auto" }}
            >
                {/* starter, creative, pro */}
                <Col lg={4} className="d-flex justify-content-center">
                    <PricingCard
                        title="Starter"
                        price={1}
                        description="Dip your toes into the world of AI-generated art with 300 credits. Perfect for first-time users who want to explore the possibilities."
                        buttonText="Buy Now"
                        onButtonClick={() => {
                            console.log("Basic");
                        }}
                    />
                </Col>
                <Col lg={4} className="d-flex justify-content-center">
                    <PricingCard
                        title="Creative"
                        price={5}
                        description="Fuel your creativity with 2000 credits, offering great value for budding artists and enthusiasts. Unleash your potential!"
                        buttonText="Buy Now"
                        onButtonClick={() => {
                            console.log("Basic");
                        }}
                    />
                </Col>
                <Col lg={4} className="d-flex justify-content-center">
                    <PricingCard
                        title="Pro"
                        price={10}
                        description="Get the ultimate AI art experience with 6000 credits. Ideal for professionals and prolific creators who demand the best."
                        buttonText="Buy Now"
                        onButtonClick={() => {
                            console.log("Basic");
                        }}
                    />
                </Col>
            </Row>
            <Row className="justify-content-center mt-5">
                <Col lg={6}>
                    <h2 className="text-center mb-4">Redeem Code</h2>
                    <p className="text-center">
                        Have a gift code from our awesome admin? Enter it here
                        to redeem your free credits and start creating!
                    </p>
                    <Form onSubmit={handleRedeemCode}>
                        <Form.Group controlId="redeemCode">
                            <Form.Control
                                type="text"
                                placeholder="Enter code here"
                                value={code}
                                onChange={(e) => setCode(e.target.value)}
                            />
                        </Form.Group>
                        <div className="text-center" style={{marginBottom: "50px"}}>
                            <Button variant="primary" type="submit">
                                Redeem
                            </Button>
                        </div>
                    </Form>
                </Col>
            </Row>
            {redeemingState && (
                <RedeemPopup state={redeemingState} onHide={() => setRedeemingState(undefined)} />
            )}
        </>
    );
};
