import { FC } from "react";
import { Container, Row, Col } from 'react-bootstrap';
import PricingCard from "./PricingCard";

export const PricingPage: FC = () => {
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
                <p style={{ fontSize: "20px", textAlign: "center", maxWidth: "70%" }}>
                    Generate stunning images with our state-of-the-art Stable
                    Diffusion AI with over 100 models to choose from. Purchase credits to create your unique
                    masterpieces without breaking the bank. Choose from our
                    flexible credit packages and get started today!
                </p>
            </div>
            <Row className="justify-content-center" style={{maxWidth: "1200px", margin: "64px auto"}}>
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
        </>
    );
};
