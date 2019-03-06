const TokenV1_0 = artifacts.require('TokenV1_0')
const TokenV1_1 = artifacts.require('TokenV1_1')

const Registry = artifacts.require('Registry')
const Proxy = artifacts.require('UpgradeabilityProxy')

const assertRevert = require('./helpers/assertRevert')

contract('Upgradeable', function ([sender, receiver]) {
  let impl_v1_0
  let impl_v1_1
  let registry
  let proxy_address

  beforeEach(async function () {
    impl_v1_0 = await TokenV1_0.new()
    impl_v1_1 = await TokenV1_1.new()

    registry = await Registry.new()
    await registry.addVersion("1.0", impl_v1_0.address)
    await registry.addVersion("1.1", impl_v1_1.address)

    const {logs} = await registry.createProxy("1.0")

    const {proxy} = logs.find(l => l.event === 'ProxyCreated').args
    proxy_address = proxy
  })

  it('should be able to upgrade', async function () {
    await TokenV1_0.at(proxy_address).mint(sender, 100)

    await Proxy.at(proxy_address).upgradeTo("1.1")

    await TokenV1_1.at(proxy_address).mint(sender, 100)

    const transferTx = await TokenV1_1.at(proxy_address).transfer(receiver, 10, { from: sender })

    console.log("Transfer TX gas cost using Inherited Storage Proxy", transferTx.receipt.gasUsed);

    const balance = await TokenV1_1.at(proxy_address).balanceOf(sender)
    assert(balance.eq(10190))
  })

  describe('override receiver to new version', async function() {
    beforeEach(async function() {
      await registry.overrideUserToVersion(receiver, "1.1")
    })

    it('should override successfully for receiver', async function () {
      const implementation_override = await Proxy.at(proxy_address).implementation({from: receiver});
      assert(implementation_override == impl_v1_1.address)
    })

    it('shuld not impact other users', async function () {
      const implementation_normal = await Proxy.at(proxy_address).implementation();
      assert(implementation_normal == impl_v1_0.address)
    })

    it('non overridden users should not have access to new version contract', async function() {
      await TokenV1_0.at(proxy_address).mint(sender, 100)
      const balance = await TokenV1_0.at(proxy_address).balanceOf(sender)
      assert(balance.eq(10100))

      assertRevert(await TokenV1_1.at(proxy_address).mint(sender, 100))
    })

    it('overridden user should have access to new version contract', async function() {
      await TokenV1_1.at(proxy_address).mint(receiver, 100, {from: receiver})
      const balance = await TokenV1_1.at(proxy_address).balanceOf(receiver)
      assert(balance.eq(100))
    })
  })

  describe('remove override user', function() {
    beforeEach(async function() {
      await registry.overrideUserToVersion(receiver, "1.1")
      const implementation_override = await Proxy.at(proxy_address).implementation({from: receiver});
      assert(implementation_override == impl_v1_1.address)
    })

    it('should remove successfully', async function() {
      await registry.removeOverrideUserToVersion(receiver)
      const implementation_override = await Proxy.at(proxy_address).implementation({from: receiver});
      assert(implementation_override == impl_v1_0.address)
    })
  })

})
