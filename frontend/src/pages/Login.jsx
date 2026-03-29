import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { authAPI } from '../lib/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Package, AlertCircle, Loader2 } from 'lucide-react';
import { seedAPI } from '../lib/api';
import { toast } from 'sonner';

const Login = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [seeding, setSeeding] = useState(false);
    const { login } = useAuth();
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            await login(email, password);
            navigate('/dashboard');
        } catch (err) {
            setError(err.response?.data?.detail || 'Login failed. Please check your credentials.');
        } finally {
            setLoading(false);
        }
    };

    const handleSeedData = async () => {
        setSeeding(true);
        try {
            await seedAPI.seed();
            setError('');
            toast.success('System initialized! Default admin: admin@crm.com / admin123');
        } catch (err) {
            toast.error('Failed to initialize system');
        } finally {
            setSeeding(false);
        }
    };

    return (
        <div 
            className="min-h-screen flex items-center justify-center p-4 relative bg-background"
            data-testid="login-page"
        >
            <Card className="w-full max-w-md bg-card/95 backdrop-blur-sm border-border rounded-sm">
                <CardHeader className="text-center space-y-4 pb-8">
                    <div className="flex justify-center">
                        <div className="p-4 bg-primary/10 rounded-sm border border-primary/20">
                            <Package className="w-12 h-12 text-primary" />
                        </div>
                    </div>
                    <div>
                        <CardTitle className="font-display text-3xl font-bold tracking-tight uppercase">
                            TIMESTIN
                        </CardTitle>
                        <CardDescription className="text-xs tracking-widest uppercase mt-2">
                            Manufacturing CRM
                        </CardDescription>
                    </div>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-6">
                        {error && (
                            <div className="flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-sm text-destructive text-sm" data-testid="login-error">
                                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                                {error}
                            </div>
                        )}
                        
                        <div className="space-y-2">
                            <Label htmlFor="email" className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                                Email
                            </Label>
                            <Input
                                id="email"
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="admin@crm.com"
                                required
                                className="bg-background border-input rounded-sm font-mono"
                                data-testid="login-email"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="password" className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                                Password
                            </Label>
                            <Input
                                id="password"
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="••••••••"
                                required
                                className="bg-background border-input rounded-sm font-mono"
                                data-testid="login-password"
                            />
                        </div>

                        <Button 
                            type="submit" 
                            className="w-full font-bold uppercase tracking-wider rounded-sm"
                            disabled={loading}
                            data-testid="login-submit"
                        >
                            {loading ? (
                                <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    Authenticating...
                                </>
                            ) : (
                                'Login'
                            )}
                        </Button>

                        <div className="relative">
                            <div className="absolute inset-0 flex items-center">
                                <span className="w-full border-t border-border" />
                            </div>
                            <div className="relative flex justify-center text-xs uppercase">
                                <span className="bg-card px-2 text-muted-foreground tracking-widest">
                                    First Time Setup
                                </span>
                            </div>
                        </div>

                        <Button
                            type="button"
                            variant="outline"
                            className="w-full font-bold uppercase tracking-wider rounded-sm"
                            onClick={handleSeedData}
                            disabled={seeding}
                            data-testid="seed-data-btn"
                        >
                            {seeding ? (
                                <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    Initializing...
                                </>
                            ) : (
                                'Initialize System'
                            )}
                        </Button>

                        <p className="text-center text-xs text-muted-foreground">
                            Creates default brands, sizes & admin account (admin@crm.com / admin123)
                        </p>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
};

export default Login;
