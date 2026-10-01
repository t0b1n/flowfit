import React from "react";
import { Link } from "react-router-dom";
import { BrandMark } from "../design/BrandMark";
import { ThemeToggle } from "../design/ThemeToggle";

type Props = {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
};

export const AuthLayout: React.FC<Props> = ({ title, subtitle, children, footer }) => (
  <div className="auth-layout">
    <div className="auth-layout__theme">
      <ThemeToggle />
    </div>
    <div className="auth-card">
      <div className="auth-card__brand">
        <Link to="/" aria-label="FlowFit home" style={{ textDecoration: "none" }}>
          <BrandMark />
        </Link>
        <h1>{title}</h1>
        {subtitle ? <p className="auth-card__subtitle">{subtitle}</p> : null}
      </div>
      <div className="auth-card__body">{children}</div>
      {footer ? <div className="auth-card__footer">{footer}</div> : null}
    </div>
  </div>
);
