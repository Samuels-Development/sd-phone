export type VehicleStatus = 'stored' | 'out' | 'impound';

export interface ValetInfo {
    enabled: boolean;
    price:   number;
}

export interface Vehicle {
    id:       string;
    model:    string;
    class:    string;
    plate:    string;
    location: string;
    garage:   string;
    status:   VehicleStatus;
    locked:   boolean;
    fuel:     number;
    engine:   number;
    body:     number;
    mileage?:     number;
    mileageUnit?: string;
    accent:   string;
    image?:   string;
    customImage?: string;
    waypoint?: { x: number; y: number };
}

export const VEHICLES: Vehicle[] = [
    { id: '1', model: 'ADDER9',     class: 'Super',          plate: '46ADR901', location: 'Legion Square Garage', garage: 'Legion Square Garage', status: 'stored', locked: true,  fuel: 86, engine: 100, body: 97, mileage: 12480, accent: '#FF3B30', image: 'https://docs.fivem.net/vehicles/adder.webp', waypoint: { x: 215.8, y: -810.0 } },
    { id: '2', model: 'KURUMA',     class: 'Sports',         plate: '88KRM220', location: 'Mirror Park Garage',   garage: 'Mirror Park Garage',   status: 'stored', locked: true,  fuel: 54, engine: 92,  body: 78, mileage: 38120, accent: '#0A84FF', image: 'https://docs.fivem.net/vehicles/kuruma.webp', customImage: 'https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=600&q=80', waypoint: { x: 1135.0, y: -776.0 } },
    { id: '3', model: 'SULTAN RS',  class: 'Sports',         plate: '12SLT777', location: 'Impound',             garage: 'Mirror Park Garage',   status: 'impound', locked: true,  fuel: 31, engine: 64,  body: 49, mileage: 51790, accent: '#30B0C7', image: 'https://docs.fivem.net/vehicles/sultanrs.webp', waypoint: { x: 409.0, y: -1623.0 } },
    { id: '4', model: 'DOMINATOR',  class: 'Muscle',         plate: '73DOM015', location: 'Sandy Shores Garage',  garage: 'Sandy Shores Garage',  status: 'stored', locked: true,  fuel: 73, engine: 88,  body: 90, mileage: 22340, accent: '#FF9500', image: 'https://docs.fivem.net/vehicles/dominator.webp', waypoint: { x: 1736.0, y: 3710.0 } },
    { id: '5', model: 'ELEGY RH8',  class: 'Sports',         plate: '55ELG348', location: 'Del Perro Freeway',    garage: 'Legion Square Garage', status: 'out',    locked: false, fuel: 12, engine: 41,  body: 23, mileage: 64015, accent: '#5E5CE6', image: 'https://docs.fivem.net/vehicles/elegy2.webp' },
    { id: '6', model: 'FUTO',       class: 'Sports Classic', plate: '09FUT612', location: 'Pillbox Hill Impound', garage: 'Mirror Park Garage',   status: 'stored', locked: true,  fuel: 68, engine: 76,  body: 71, mileage: 47600, accent: '#34C759', image: 'https://docs.fivem.net/vehicles/futo.webp', waypoint: { x: 409.0, y: -1623.0 } },
];
