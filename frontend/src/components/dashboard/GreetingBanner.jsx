import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { Badge } from '../ui/badge';
import { CalendarDays } from 'lucide-react';

const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return 'Good Morning';
    if (hour >= 12 && hour < 17) return 'Good Afternoon';
    return 'Good Evening';
};

const formatCurrentDate = () => {
    return new Intl.DateTimeFormat('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    }).format(new Date());
};

const GreetingBanner = () => {
    const { user } = useAuth();

    return (
        <div
            className="industrial-card border-l-4 border-l-primary p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
            data-testid="greeting-banner"
        >
            <div>
                <h1 className="font-display text-2xl lg:text-3xl font-bold tracking-tight uppercase text-foreground">
                    {getGreeting()}, {user?.username || 'User'}
                </h1>
                <p className="text-sm text-muted-foreground mt-1">
                    Here's what's happening with your production today.
                </p>
            </div>
            <Badge variant="outline" className="self-start sm:self-center flex items-center gap-2 px-3 py-1.5 text-sm font-mono border-primary/30 text-primary">
                <CalendarDays className="w-4 h-4" />
                {formatCurrentDate()}
            </Badge>
        </div>
    );
};

export default GreetingBanner;
