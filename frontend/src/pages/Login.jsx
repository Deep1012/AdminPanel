import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '../components/ui/form';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Package, AlertCircle, Loader2 } from 'lucide-react';
import { getErrorMessage } from '../lib/errors';
import { loginSchema } from '../lib/schemas';

const LABEL_CLASS = 'text-xs font-bold uppercase tracking-widest text-muted-foreground';

const Login = () => {
    const [error, setError] = useState('');
    const { login } = useAuth();
    const navigate = useNavigate();

    const form = useForm({
        resolver: zodResolver(loginSchema),
        defaultValues: { email: '', password: '' },
    });
    const { isSubmitting } = form.formState;

    const onSubmit = async (values) => {
        setError('');
        try {
            await login(values.email, values.password);
            navigate('/dashboard');
        } catch (err) {
            setError(getErrorMessage(err, 'Login failed. Please check your credentials.'));
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-4 relative bg-background" data-testid="login-page">
            <Card className="w-full max-w-md bg-card/95 backdrop-blur-sm border-border rounded-sm">
                <CardHeader className="text-center space-y-4 pb-8">
                    <div className="flex justify-center">
                        <div className="p-4 bg-primary/10 rounded-sm border border-primary/20">
                            <Package className="w-12 h-12 text-primary" />
                        </div>
                    </div>
                    <div>
                        <CardTitle className="font-display text-3xl font-bold tracking-tight uppercase">TIMESTIN</CardTitle>
                        <CardDescription className="text-xs tracking-widest uppercase mt-2">Manufacturing CRM</CardDescription>
                    </div>
                </CardHeader>
                <CardContent>
                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6" noValidate>
                            {error && (
                                <div className="flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-sm text-destructive text-sm" data-testid="login-error">
                                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                                    {error}
                                </div>
                            )}
                            <FormField
                                control={form.control}
                                name="email"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className={LABEL_CLASS}>Email</FormLabel>
                                        <FormControl>
                                            <Input {...field} type="email" placeholder="admin@crm.com" className="bg-background border-input rounded-sm font-mono" data-testid="login-email" />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="password"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className={LABEL_CLASS}>Password</FormLabel>
                                        <FormControl>
                                            <Input {...field} type="password" placeholder="••••••••" className="bg-background border-input rounded-sm font-mono" data-testid="login-password" />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <Button type="submit" className="w-full font-bold uppercase tracking-wider rounded-sm" disabled={isSubmitting} data-testid="login-submit">
                                {isSubmitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Authenticating...</> : 'Login'}
                            </Button>
                        </form>
                    </Form>
                </CardContent>
            </Card>
        </div>
    );
};

export default Login;
