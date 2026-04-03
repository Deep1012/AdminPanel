import {
    LayoutDashboard, ShoppingCart, ClipboardList, Printer, Factory, Truck,
    Settings, Tag, Ruler, Package, Users, Layers, Menu, Boxes, Warehouse,
    BarChart3, FileText, CircleDollarSign, Wrench, Shield, Database, Activity
} from 'lucide-react';

const ICON_MAP = {
    LayoutDashboard,
    ShoppingCart,
    ClipboardList,
    Printer,
    Factory,
    Truck,
    Settings,
    Tag,
    Ruler,
    Package,
    Users,
    Layers,
    Menu,
    Boxes,
    Warehouse,
    BarChart3,
    FileText,
    CircleDollarSign,
    Wrench,
    Shield,
    Database,
    Activity,
};

export const getIcon = (name) => ICON_MAP[name] || Package;

export const AVAILABLE_ICONS = Object.keys(ICON_MAP);

export default ICON_MAP;
