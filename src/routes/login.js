const { Router } = require("express");
const router = Router();
const indexController = require("../controllers/indexController");
const passport = require("passport");

router.post(
  "/login",
  passport.authenticate("local", { session: false }),
  indexController.loginPost,
);

module.exports = router;
