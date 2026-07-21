
import type { LucideIcon } from 'lucide-react';
import {
    Briefcase, Building2, Car, CircleDot, Coffee, CreditCard, Crown, Drill, Film, Flame, Fuel,
    Home, MapPin, Pill, Pizza, ReceiptText, Ship, ShoppingBag, ShoppingCart, Spade, Stethoscope,
    Type, Wrench, Zap,
} from 'lucide-react';

import { t } from '@/i18n';

type AccountKind = 'checking' | 'savings' | 'credit';

export interface Account {
    id:      string;
    label:   string;
    kind:    AccountKind;
    last4:   string;
    balance: number;
    holder:  string;
    style:   'titanium' | 'midnight' | 'rose' | 'forest';
}

export const ACCOUNTS: Account[] = [
    {
        id:      'maze-checking',
        label:   'Maze Bank · Everyday',
        kind:    'checking',
        last4:   '4242',
        balance: 28_415.62,
        holder:  'SAM NICOL',
        style:   'titanium',
    },
    {
        id:      'maze-savings',
        label:   'Maze Bank · Savings',
        kind:    'savings',
        last4:   '0891',
        balance: 92_120.00,
        holder:  'SAM NICOL',
        style:   'forest',
    },
    {
        id:      'fleeca-credit',
        label:   'Fleeca · Black',
        kind:    'credit',
        last4:   '7711',
        balance: -1_284.50,             // negative = amount owed on credit
        holder:  'SAM NICOL',
        style:   'midnight',
    },
];

export type Category =
    | 'food' | 'groceries' | 'shopping' | 'transport' | 'fuel'
    | 'entertainment' | 'services' | 'health' | 'bills' | 'housing'
    | 'income' | 'transfer' | 'invoice' | 'chess' | 'connectfour' | 'battleship' | 'blackjack' | 'wordle' | 'ryde' | 'streaks';

export interface CategoryMeta {
    label: string;
    icon:  LucideIcon;
    color: string;
}

export function getCategories(): Record<Category, CategoryMeta> {
    return {
        food:          { label: t('banking.catFood', 'Food & Drink'),  icon: Pizza,        color: '#ff9f0a' },
        groceries:     { label: t('banking.catGroceries', 'Groceries'),     icon: ShoppingCart, color: '#34c759' },
        shopping:      { label: t('banking.catShopping', 'Shopping'),      icon: ShoppingBag,  color: '#ff375f' },
        transport:     { label: t('banking.catTransport', 'Transport'),     icon: Car,          color: '#5e5ce6' },
        fuel:          { label: t('banking.catFuel', 'Fuel'),          icon: Fuel,         color: '#0a84ff' },
        entertainment: { label: t('banking.catEntertainment', 'Entertainment'), icon: Film,         color: '#bf5af2' },
        services:      { label: t('banking.catServices', 'Services'),      icon: Wrench,       color: '#64d2ff' },
        health:        { label: t('banking.catHealth', 'Health'),        icon: Stethoscope,  color: '#ff453a' },
        bills:         { label: t('banking.catBills', 'Bills'),         icon: Zap,          color: '#ffd60a' },
        housing:       { label: t('banking.catHousing', 'Housing'),       icon: Home,         color: '#8e8e93' },
        income:        { label: t('banking.catIncome', 'Income'),        icon: Briefcase,    color: '#30d158' },
        transfer:      { label: t('banking.catTransfer', 'Transfer'),      icon: CreditCard,   color: '#aeaeb2' },
        invoice:       { label: t('banking.catInvoice', 'Invoice'),       icon: ReceiptText,  color: '#0a84ff' },
        chess:         { label: t('banking.catChess', 'Chess'),         icon: Crown,        color: '#769656' },
        connectfour:   { label: t('banking.catConnectFour', 'Connect Four'),  icon: CircleDot,    color: '#1E66D0' },
        battleship:    { label: t('banking.catBattleship', 'Battleship'),    icon: Ship,         color: '#17A0B5' },
        blackjack:     { label: t('banking.catBlackjack', 'Blackjack'),     icon: Spade,        color: '#1C8A4E' },
        wordle:        { label: t('banking.catWordle', 'Wordle'),        icon: Type,         color: '#6AAA64' },
        ryde:          { label: t('banking.catRyde', 'Ryde'),          icon: Car,          color: '#1c1c1e' },
        streaks:       { label: t('banking.catStreaks', 'Streaks'),       icon: Flame,        color: '#FF7A1A' },
    };
}

export interface Transaction {
    id:        string;
    date:      string;
    merchant:  string;
    category:  Category;
    amount:    number;
    accountId: string;
    pending?:  boolean;
    recurring?:boolean;
    iconOverride?: LucideIcon;
    peerNumber?:   string;
    peerInitials?: string;
    peerColor?:    string;
}

const TODAY = new Date('2026-05-18T14:30:00');

function hoursAgo(h: number): string {
    return new Date(TODAY.getTime() - h * 3_600_000).toISOString();
}

function daysAgo(d: number, hour = 12): string {
    const dt = new Date(TODAY);
    dt.setDate(dt.getDate() - d);
    dt.setHours(hour, 0, 0, 0);
    return dt.toISOString();
}

export const TRANSACTIONS: Transaction[] = [
    { id: 't00d', date: hoursAgo(0.3), merchant: 'Samuel White', category: 'transfer', amount:  1_500.00, accountId: 'maze-checking', peerNumber: '3105550148', peerInitials: 'SW', peerColor: '#5e5ce6' },
    { id: 't00e', date: hoursAgo(0.4), merchant: 'Maya Lopez',   category: 'transfer', amount:   -250.00, accountId: 'maze-checking', peerNumber: '3105550199', peerInitials: 'ML', peerColor: '#ff375f' },
    { id: 't00c', date: hoursAgo(0.5), merchant: 'Winnings vs Maya Lopez',  category: 'connectfour', amount: 6_000, accountId: 'maze-checking' },
    { id: 't00a', date: hoursAgo(1),  merchant: 'Winnings vs Ryan Carter', category: 'chess', amount: 20_000, accountId: 'maze-checking' },
    { id: 't00b', date: hoursAgo(1.5), merchant: 'Wager vs Ryan Carter',    category: 'chess', amount: -10_000, accountId: 'maze-checking' },
    { id: 't01', date: hoursAgo(2),  merchant: 'Burger Shot',       category: 'food',          amount:   -18.45, accountId: 'maze-checking', pending: true,                           iconOverride: Pizza  },
    { id: 't02', date: hoursAgo(5),  merchant: 'Premium Deluxe',    category: 'transport',     amount:  -385.00, accountId: 'maze-checking',                                          iconOverride: Car    },
    { id: 't03', date: hoursAgo(7),  merchant: 'LTD Gasoline',      category: 'fuel',          amount:   -52.30, accountId: 'maze-checking' },
    { id: 't04', date: hoursAgo(9),  merchant: '24/7 Supermarket',  category: 'groceries',     amount:   -92.18, accountId: 'maze-checking' },

    { id: 't10', date: daysAgo(1, 19), merchant: 'Vanilla Unicorn', category: 'entertainment', amount:  -240.00, accountId: 'fleeca-credit' },
    { id: 't11', date: daysAgo(1, 14), merchant: "Benny's Original Motorworks", category: 'services',  amount:-2_450.00, accountId: 'maze-checking',                                  iconOverride: Drill  },
    { id: 't12', date: daysAgo(1, 11), merchant: 'Pillbox Hospital',category: 'health',        amount:  -185.00, accountId: 'maze-checking',                                          iconOverride: Pill   },

    { id: 't20', date: daysAgo(2, 17), merchant: 'Ponsonbys',        category: 'shopping',      amount:  -612.99, accountId: 'fleeca-credit' },
    { id: 't21', date: daysAgo(2, 8),  merchant: 'LSPD Payroll',     category: 'income',        amount: 3_200.00, accountId: 'maze-checking', recurring: true                          },
    { id: 't22', date: daysAgo(3, 20), merchant: 'Bahama Mamas',     category: 'entertainment', amount:  -148.50, accountId: 'fleeca-credit' },
    { id: 't23', date: daysAgo(3, 12), merchant: 'Sandy Coffee',     category: 'food',          amount:   -12.40, accountId: 'maze-checking',                                          iconOverride: Coffee },
    { id: 't24', date: daysAgo(4, 9),  merchant: 'Globe Electric',   category: 'bills',         amount:  -174.80, accountId: 'maze-checking', recurring: true                          },
    { id: 't25', date: daysAgo(4, 18), merchant: 'Vespucci Movie',   category: 'entertainment', amount:   -34.00, accountId: 'maze-checking' },

    { id: 't30', date: daysAgo(6, 10), merchant: 'Maze Bank Tower',  category: 'housing',       amount: -2_000.00,accountId: 'maze-checking', recurring: true,                         iconOverride: Building2 },
    { id: 't31', date: daysAgo(7, 13), merchant: 'GoPostal',         category: 'services',      amount:   -28.00, accountId: 'maze-checking',                                          iconOverride: MapPin  },
    { id: 't32', date: daysAgo(8, 19), merchant: 'Cluckin Bell',     category: 'food',          amount:   -23.85, accountId: 'maze-checking' },
    { id: 't33', date: daysAgo(9, 11), merchant: 'Transfer to Savings', category: 'transfer',    amount: -1_500.00,accountId: 'maze-checking' },
    { id: 't34', date: daysAgo(9, 11), merchant: 'From Checking',    category: 'transfer',      amount:  1_500.00,accountId: 'maze-savings' },
    { id: 't35', date: daysAgo(10, 8), merchant: 'LSPD Payroll',     category: 'income',        amount: 3_200.00, accountId: 'maze-checking', recurring: true                          },
];


export function formatMoney(amount: number, opts: { showSign?: boolean; whole?: boolean } = {}): string {
    const absVal = opts.whole ? Math.floor(Math.abs(amount)) : Math.abs(amount);
    const abs = absVal.toLocaleString('en-US', {
        minimumFractionDigits: opts.whole ? 0 : 2,
        maximumFractionDigits: opts.whole ? 0 : 2,
    });
    if (opts.showSign && amount > 0) return `+$${abs}`;
    if (amount < 0)                  return `-$${abs}`;
    return `$${abs}`;
}
