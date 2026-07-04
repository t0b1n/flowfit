import React from "react";
import { Link } from "react-router-dom";

type Props = {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
};

export const AuthLayout: React.FC<Props> = ({ title, subtitle, children, footer }) => (
  <div className="auth-layout">
    <div className="auth-card">
      <div className="auth-card__brand">
        <Link to="/" className="eyebrow">bikegeo</Link>
        <h1>{title}</h1>
        {subtitle ? <p className="auth-card__subtitle">{subtitle}</p> : null}
      </div>
      <div className="auth-card__body">{children}</div>
      {footer ? <div className="auth-card__footer">{footer}</div> : null}
    </div>
  </div>
);
