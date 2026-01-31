import React, { Component } from 'react';
import { authService } from '../services/auth';
import LoadingOverlay from '../elements/LoadingOverlay';
import './Auth.css';

class SignIn extends Component {
    constructor(props) {
        super(props);
        this.state = {
            email: 'test@gmail.com',
            password: 'Test1234',
            showPassword: false,
            isLoading: false,
            error: ''
        };
    }

    handleInputChange = (e) => {
        const { name, value, type, checked } = e.target;
        this.setState({
            [name]: type === 'checkbox' ? checked : value
        });
    }

    handleSubmit = async (e) => {
        e.preventDefault();
        this.setState({ isLoading: true, error: '' });

        try {
            const response = await authService.login({
                email: this.state.email,
                password: this.state.password
            });

            if (response && response.data) {
                // Store auth data
                authService.setAuthData(response.data.accessToken, response.data.user);

                // Call parent handler with user data
                this.props.onSignIn(response.data.user);
            } else {
                this.setState({ error: response.message || 'Login failed' });
            }
        } catch (err) {
            const errorMessage = err.response?.data?.message || 'Invalid email or password';
            this.setState({ error: errorMessage });
        } finally {
            this.setState({ isLoading: false });
        }
    }

    render() {
        const { email, password, isLoading, error } = this.state;

        return (
            <div className="auth-container">
                <div className="auth-card">
                    <div className="auth-header">
                        <div className="auth-logo">
                            <div className="logo-icon">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" fill="none"/>
                                    <ellipse cx="12" cy="12" rx="10" ry="4" stroke="currentColor" strokeWidth="2" fill="none"/>
                                    <path d="M2 12h20M12 2v20" stroke="currentColor" strokeWidth="2"/>
                                </svg>
                            </div>
                            <h1>Virtual Tour Creator</h1>
                        </div>
                        <p>Sign in to your account</p>
                    </div>

                    <form className="auth-form" onSubmit={this.handleSubmit}>
                        {error && <div className="error-message">{error}</div>}

                        <div className="form-group">
                            <label htmlFor="email">Email</label>
                            <input
                                type="email"
                                id="email"
                                name="email"
                                value={email}
                                onChange={this.handleInputChange}
                                placeholder=""
                                required
                            />
                        </div>

                        <div className="form-group">
                            <label htmlFor="password">Password</label>
                            <div className="password-input-wrap">
                                <input
                                    type={this.state.showPassword ? 'text' : 'password'}
                                    id="password"
                                    name="password"
                                    value={password}
                                    onChange={this.handleInputChange}
                                    placeholder="Enter your password"
                                    required
                                />
                                <button
                                    type="button"
                                    className="password-toggle"
                                    onClick={() => this.setState({ showPassword: !this.state.showPassword })}
                                    aria-label={this.state.showPassword ? 'Hide password' : 'Show password'}
                                >
                                    {this.state.showPassword ? (
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                                    ) : (
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                                    )}
                                </button>
                            </div>
                        </div>

                        <button
                            type="submit"
                            className="auth-button primary"
                            disabled={isLoading}
                        >
                            {isLoading ? 'Signing in...' : 'Sign In'}
                        </button>
                    </form>
                </div>
                {isLoading && <LoadingOverlay message="Signing in..." />}
            </div>
        );
    }
}

export default SignIn;
