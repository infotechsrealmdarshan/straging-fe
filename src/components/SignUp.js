import React, { Component } from 'react';
import { authService } from '../services/auth';
import LoadingOverlay from '../elements/LoadingOverlay';
import './Auth.css';

class SignUp extends Component {
    constructor(props) {
        super(props);
        this.state = {
            fullName: '',
            email: '',
            password: '',
            confirmPassword: '',
            agreeToTerms: false,
            isLoading: false,
            errors: {}
        };
    }

    handleInputChange = (e) => {
        const { name, value, type, checked } = e.target;
        this.setState({
            [name]: type === 'checkbox' ? checked : value,
            errors: { ...this.state.errors, [name]: '' }
        });
    }

    validateForm = () => {
        const { fullName, email, password, confirmPassword, agreeToTerms } = this.state;
        const errors = {};

        if (!fullName.trim()) errors.fullName = 'Full name is required';
        if (!email.trim()) errors.email = 'Email is required';
        if (!/\S+@\S+\.\S+/.test(email)) errors.email = 'Email is invalid';
        if (!password) errors.password = 'Password is required';

        // Password validation: minimum 8 characters, uppercase, lowercase, and number
        const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
        if (!passwordRegex.test(password)) {
            errors.password = 'Password must be at least 8 characters long and contain uppercase, lowercase and number';
        }

        if (password !== confirmPassword) errors.confirmPassword = 'Passwords do not match';
        if (!agreeToTerms) errors.agreeToTerms = 'You must agree to the terms';

        this.setState({ errors });
        return Object.keys(errors).length === 0;
    }

    handleSubmit = async (e) => {
        e.preventDefault();

        if (!this.validateForm()) return;

        this.setState({ isLoading: true });

        try {
            const response = await authService.register({
                fullName: this.state.fullName,
                email: this.state.email,
                password: this.state.password
            });

            if (response && response.data) {
                // Store auth data
                authService.setAuthData(response.data.accessToken, response.data.user);

                // Call parent handler with user data
                this.props.onSignUp(response.data.user);
            } else {
                this.setState({ errors: { general: response.message || 'Registration failed' } });
            }
        } catch (err) {
            const errorMessage = err.response?.data?.message || 'Registration failed. Please try again.';
            this.setState({ errors: { general: errorMessage } });
        } finally {
            this.setState({ isLoading: false });
        }
    }

    render() {
        const { fullName, email, password, confirmPassword, agreeToTerms, isLoading, errors } = this.state;

        return (
            <div className="auth-container">
                <div className="auth-card">
                    <div className="auth-header">
                        <div className="auth-logo">
                            <div className="logo-icon">🌐</div>
                            <h1>Virtual Tour Creator</h1>
                        </div>
                        <p>Create your account</p>
                    </div>

                    <form className="auth-form" onSubmit={this.handleSubmit}>
                        {errors.general && <div className="error-message">{errors.general}</div>}

                        <div className="form-group">
                            <label htmlFor="fullName">Full Name</label>
                            <input
                                type="text"
                                id="fullName"
                                name="fullName"
                                value={fullName}
                                onChange={this.handleInputChange}
                                placeholder="Enter your full name"
                                required
                            />
                            {errors.fullName && <span className="field-error">{errors.fullName}</span>}
                        </div>

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
                            {errors.email && <span className="field-error">{errors.email}</span>}
                        </div>

                        <div className="form-group">
                            <label htmlFor="password">Password</label>
                            <input
                                type="password"
                                id="password"
                                name="password"
                                value={password}
                                onChange={this.handleInputChange}
                                placeholder="Create a password (min 8 characters)"
                                required
                            />
                            {errors.password && <span className="field-error">{errors.password}</span>}
                        </div>

                        <div className="form-group">
                            <label htmlFor="confirmPassword">Confirm Password</label>
                            <input
                                type="password"
                                id="confirmPassword"
                                name="confirmPassword"
                                value={confirmPassword}
                                onChange={this.handleInputChange}
                                placeholder="Confirm your password"
                                required
                            />
                            {errors.confirmPassword && <span className="field-error">{errors.confirmPassword}</span>}
                        </div>

                        <div className="form-group">
                            <label className="checkbox-label">
                                <input
                                    type="checkbox"
                                    name="agreeToTerms"
                                    checked={agreeToTerms}
                                    onChange={this.handleInputChange}
                                />
                                <span className="checkmark"></span>
                                I agree to the <a href="#" className="link">Terms of Service</a> and <a href="#" className="link">Privacy Policy</a>
                            </label>
                            {errors.agreeToTerms && <span className="field-error">{errors.agreeToTerms}</span>}
                        </div>

                        <button
                            type="submit"
                            className="auth-button primary"
                            disabled={isLoading}
                        >
                            {isLoading ? 'Creating Account...' : 'Create Account'}
                        </button>
                    </form>



                    <div className="auth-footer">
                        <p>
                            Already have an account?
                            <button
                                className="link-button"
                                onClick={() => this.props.onSwitchToSignIn()}
                            >
                                Sign in
                            </button>
                        </p>
                    </div>
                </div>
                {isLoading && <LoadingOverlay message="Creating your account..." />}
            </div>
        );
    }
}

export default SignUp;
