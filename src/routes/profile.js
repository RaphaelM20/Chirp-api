const { Router } = require("express");
const router = Router();
const indexController = require("../controllers/indexController");
const passport = require("passport");

router.get(
  "/:username",
  passport.authenticate("jwt", { session: false }),
  indexController.profileGet,
);

module.exports = router;
