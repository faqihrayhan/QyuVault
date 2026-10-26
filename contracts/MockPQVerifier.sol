// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IPQ {
    function verifySlhDsaSha2128s(bytes calldata vk, bytes calldata message, bytes calldata sig)
        external
        view
        returns (bool isValid);
}

contract MockPQVerifier is IPQ {
    error MockRevert();
    error WrongVkLength();
    error WrongSigLength();

    bool public shouldReturn;
    bool public shouldRevert;

    function setShouldReturn(bool v) external {
        shouldReturn = v;
    }

    function setShouldRevert(bool v) external {
        shouldRevert = v;
    }

    function verifySlhDsaSha2128s(bytes calldata vk, bytes calldata, bytes calldata sig)
        external
        view
        override
        returns (bool isValid)
    {
        if (shouldRevert) revert MockRevert();
        if (vk.length != 32) revert WrongVkLength();
        if (sig.length != 7856) revert WrongSigLength();
        return shouldReturn;
    }
}
