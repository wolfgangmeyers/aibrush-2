import { FC, useEffect, useState } from "react";
import { Row, Col, Form, Button } from "react-bootstrap";
import { loadStripe, Stripe } from "@stripe/stripe-js";
import { AIBrushApi } from "../../client";
import PricingCard from "./PricingCard";

import "./PricingPage.css";
import RedeemPopup from "./RedeemPopup";

interface Props {
    api: AIBrushApi;
}

export const PricingPage: FC<Props> = ({ api }) => {
    const [code, setCode] = useState<string>("");
    const [redeemingState, setRedeemingState] = useState<
        "busy" | "success" | "failure" | undefined
    >(undefined);
    const [stripe, setStripe] = useState<Stripe | undefined>(undefined);

    const handleRedeemCode = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setRedeemingState("busy");
        setCode("");
        api.redeemDepositCode(code)
            .then(() => {
                setRedeemingState("success");
            })
            .catch(() => {
                setRedeemingState("failure");
            });
    };

    const handleBuy = async (product: string) => {
        if (!stripe) {
            // alert the user that payments aren't working, and they need to contact support
            alert("Payments are not working right now. Please contact support at admin@aibrush.art.");
            return;
        }
        console.log("buying product", product);
        const baseUrl = `${window.location.protocol}//${window.location.host}`;
        const result = await api.createStripeSession({
            product_id: product,
            success_url: `${baseUrl}/stripe-success`,
            cancel_url: `${baseUrl}/stripe-cancel`,
        });
        console.log("got session id", result.data)
        await stripe.redirectToCheckout({ sessionId: result.data.session_id });
    };

    useEffect(() => {
        const loadStripeLibrary = async () => {
            const stripeInstance = await loadStripe("pk_live_51MB0zEC2IU2ctHz653kY6uo9UcwgPxmcw2ISGzThAAQMtklAV2kfuceigzlL9LjCNyXCJkcIouVajlX8ErrRtWaz00Tqobzi2s");
            if (!stripeInstance) {
                console.error("Failed to load Stripe library");
                return;
            }
            setStripe(stripeInstance);
        };

        loadStripeLibrary();
    }, []);

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
                        price={2}
                        description="Dip your toes into the world of AI-generated art with 600 credits. Perfect for first-time users who want to explore the possibilities."
                        buttonText="Buy Now"
                        onButtonClick={() => {
                            handleBuy("starter");
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
                            handleBuy("creative");
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
                            handleBuy("pro");
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
                        <div
                            className="text-center"
                            style={{ marginBottom: "50px" }}
                        >
                            <Button variant="primary" type="submit">
                                Redeem
                            </Button>
                        </div>
                    </Form>
                </Col>
            </Row>
            {redeemingState && (
                <RedeemPopup
                    state={redeemingState}
                    onHide={() => setRedeemingState(undefined)}
                />
            )}
        </>
    );
};
