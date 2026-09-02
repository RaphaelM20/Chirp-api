const { Router } = require("express");
const router = Router();
const indexController = require("../controllers/indexController");
const passport = require("passport");

router.get(
  "/not-following",
  passport.authenticate("jwt", { session: false }),
  indexController.notFollowingUsersGet,
);

router.post(
  "/follow",
  passport.authenticate("jwt", { session: false }),
  indexController.followUser,
);

router.delete(
  "/follow",
  passport.authenticate("jwt", { session: false }),
  indexController.unfollowUser,
);
module.exports = router;
