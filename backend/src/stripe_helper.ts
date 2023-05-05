import Stripe from "stripe";
// product name to priceid mappings (test mode):
// starter -> price_1N4UbAC2IU2ctHz6r6eoJ1BE
// creative -> price_1N4UbpC2IU2ctHz6IzDX3ScZ
// pro -> price_1N4UcIC2IU2ctHz6xqGVQ8iw

const productToPriceId = {
    starter: "price_1N4UbAC2IU2ctHz6r6eoJ1BE",
    creative: "price_1N4UbpC2IU2ctHz6IzDX3ScZ",
    pro: "price_1N4UcIC2IU2ctHz6xqGVQ8iw",
};

const priceIdToCredits = {
    price_1N4UbAC2IU2ctHz6r6eoJ1BE: 300,
    price_1N4UbpC2IU2ctHz6IzDX3ScZ: 2000,
    price_1N4UcIC2IU2ctHz6xqGVQ8iw: 6000,
};

export interface StripeHelper {
    createCheckoutSession(
        productId: string,
        successUrl: string,
        cancelUrl: string,
        customerId: string | undefined,
    ): Promise<string>;

    constructEvent(
        payload: any,
        signature: string,
    ): Stripe.Event;

    listLineItems(
        sessionId: string
    ): Promise<Stripe.ApiList<Stripe.LineItem>>;
}

export class StripeHelperImpl implements StripeHelper {
    private stripe: Stripe;

    constructor(stripeSecretKey: string, private webhookSecret: string) {
        this.stripe = new Stripe(stripeSecretKey, {
            apiVersion: "2022-11-15",
        });
    }

    async createCheckoutSession(
        productId: string,
        successUrl: string,
        cancelUrl: string,
        customerId: string | undefined,
    ): Promise<string> {
        const priceId = productToPriceId[productId];
        const session = await this.stripe.checkout.sessions.create({
            payment_method_types: ["card"],
            line_items: [
                {
                    price: priceId,
                    quantity: 1,
                },
            ],
            mode: "payment",
            success_url: successUrl,
            cancel_url: cancelUrl,
            customer: customerId,
        });
        return session.id;
    }

    constructEvent(payload: any, signature: string): Stripe.Event {
        return this.stripe.webhooks.constructEvent(
            payload,
            signature,
            this.webhookSecret
        );
    }

    async listLineItems(
        sessionId: string
    ): Promise<Stripe.ApiList<Stripe.LineItem>> {
        return this.stripe.checkout.sessions.listLineItems(sessionId);
    }
}

export class MockStripeHelper implements StripeHelper {
    async createCheckoutSession(
        productId: string,
        successUrl: string,
        cancelUrl: string,
        customerId: string | undefined,
    ): Promise<string> {
        return "mock-session-id";
    }

    constructEvent(
        payload: any,
        signature: string,
    ): Stripe.Event {
        return null;
    }

    async listLineItems(
        sessionId: string
    ): Promise<Stripe.ApiList<Stripe.LineItem>> {
        return null;
    }
}

export function calculateCredits(priceId: string, quantity: number): number {
    return priceIdToCredits[priceId] * quantity;
}
