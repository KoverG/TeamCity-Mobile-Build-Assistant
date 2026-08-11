namespace TeamCityHelper.Api.Tests;

public sealed class FoundationTests
{
    [Fact]
    public void ApiAssemblyHasExpectedName()
    {
        var assemblyName = typeof(Program).Assembly.GetName().Name;

        Assert.Equal("TeamCityHelper.Api", assemblyName);
    }
}
