const createTokenUser = (user) => {
    return {name : user.name, email : user.email , role : user.role, userId : user.id}
}

module.exports = createTokenUser