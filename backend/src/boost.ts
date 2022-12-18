export interface BoostLevel {
    level: number
    name: string
    description: string
}

export const BOOST_LEVELS: BoostLevel[] = [
    {
        level: 1,
        name: "Quick",
        description: "This boost is a great deal for anyone who needs dedicated gpu power on a budget. Estimated peak output: 350 images per hour"
    },
    {
        level: 2,
        name: "Fast",
        description: "With twice the gpu power of the Quick boost, the Fast boost is ideal for the impatient hobbyist. Estimated peak output: 700 images per hour"
    },
    {
        level: 4,
        name: "Pro",
        description: "Is Fast not enough for you? Prepare to break the sound barrier and double your gpu power with the Pro boost. Estimated peak output: 1400 images per hour"
    },
    {
        level: 8,
        name: "Super",
        description: "Upgrade to the Pro boost to achieve unparalleled speed. This boost is for people who want to make images as fast as possible. Estimated peak output: 2800 images per hour"
    }
]