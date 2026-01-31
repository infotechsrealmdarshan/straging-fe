import React, { Component } from 'react';
import { authService } from '../services/auth';
import LoadingOverlay from '../elements/LoadingOverlay';
import './Auth.css';

class SignIn extends Component {
    constructor(props) {
        super(props);
        this.state = {
            email: '',
            password: '',
            rememberMe: false,
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
        const { email, password, rememberMe, isLoading, error } = this.state;

        return (
            <div className="auth-container">
                <div className="auth-card">
                    <div className="auth-header">
                        <div className="auth-logo">
                            <div className="logo-icon">🌐</div>
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
                                placeholder="Enter your email"
                                required
                            />
                        </div>

                        <div className="form-group">
                            <label htmlFor="password">Password</label>
                            <input
                                type="password"
                                id="password"
                                name="password"
                                value={password}
                                onChange={this.handleInputChange}
                                placeholder="Enter your password"
                                required
                            />
                        </div>

                        <div className="form-options">
                            <label className="checkbox-label">
                                <input
                                    type="checkbox"
                                    name="rememberMe"
                                    checked={rememberMe}
                                    onChange={this.handleInputChange}
                                />
                                <span className="checkmark"></span>
                                Remember me
                            </label>
                            <a href="#" className="forgot-password">Forgot password?</a>
                        </div>

                        <button
                            type="submit"
                            className="auth-button primary"
                            disabled={isLoading}
                        >
                            {isLoading ? 'Signing in...' : 'Sign In'}
                        </button>
                    </form>



                    <div className="auth-footer">
                        <p>
                            Don't have an account?
                            <button
                                className="link-button"
                                onClick={() => this.props.onSwitchToSignUp()}
                            >
                                Sign up
                            </button>
                        </p>
                    </div>
                </div>
                {isLoading && <LoadingOverlay message="Signing in..." />}
            </div>
        );
    }
}

export default SignIn;
