import { createBrowserRouter } from "react-router";
import LandingPage from "./components/LandingPage";
import FormPage from "./components/FormPage";

export const router = createBrowserRouter([
  { path: "/", Component: LandingPage },
  { path: "/form", Component: FormPage },
]);
